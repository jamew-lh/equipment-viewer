// Office editing: every route here writes to Airtable, records the change in the
// Change Log table, keeps an Undo for a few minutes, and updates the saved copy
// so everyone sees the change on their next load.
import { randomBytes } from 'node:crypto';
import { EQUIPMENT, MOVES, CHANGE_LOG, EDITABLE, UNDO_MINUTES, MOVE_TYPES, MOVE_TYPE_MAP } from './config.mjs';
import { machine, files, idKey, text } from './build.mjs';
import { makeSiteNamer } from './sites.mjs';

export class EditError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (msg) => { throw new EditError(400, msg); };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);
const same = (a, b) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a ?? '') === JSON.stringify(Array.isArray(b) ? [...b].sort() : b ?? '');
const show = (k, v) => (k === 'tk' ? (v ? 'Ticked' : 'Not ticked') : Array.isArray(v) ? v.join(', ') : String(v ?? ''));
const LABEL = { loc: 'Location', st: 'Status', ty: 'Type', mk: 'Make', md: 'Model', yr: 'Year', sn: 'Serial number', wt: 'Operating weight', dl: 'Dealer', flt: 'Filter list', tooth: 'Tooth type', nt: 'Notes', tk: 'TRACKING' };

function ctx(deps, user) {
  const { airtable, store, now } = deps;
  const pending = [];
  const log = async (rows) => {
    const F = CHANGE_LOG.fields, when = new Date(now()).toISOString();
    pending.push(...rows.map((r) => ({ at: now(), by: user.name, rec: r.record || '', id: r.equipment, field: r.change, from: r.from || '', to: r.to || '' })));
    const recs = await airtable.create(CHANGE_LOG.table, rows.map((r) => ({
      [F.equipment]: r.equipment, [F.when]: when, [F.who]: user.name, [F.change]: r.change,
      [F.from]: r.from || '', [F.to]: r.to || '', [F.record]: r.record || '',
    })));
    const ids = recs.map((r) => r.id);
    pending.slice(-ids.length).forEach((p, i) => { p.lid = ids[i]; });
    return ids;
  };
  const keepUndo = async (ops) => {
    const token = randomBytes(12).toString('base64url');
    await store.set(`undo/${token}`, { at: now(), by: user.name, ops });
    return token;
  };
  // Apply the same change to the saved copy, so other people see it right away.
  const patch = async (fn) => {
    await store.set('last-edit', { at: now() });
    const snap = await store.get('snapshot');
    if (!snap) return;
    fn(snap);
    snap.log = [...pending.reverse(), ...(snap.log || [])].slice(0, 2000);
    snap.asOf = Math.max(now(), (snap.asOf || 0) + 1);
    snap.rev = randomBytes(6).toString('base64url');
    await store.set('snapshot', snap);
  };
  return { log, keepUndo, patch };
}

async function currentMachine(deps, rec) {
  const r = await deps.airtable.getRecord(EQUIPMENT.table, rec);
  return machine(r, EQUIPMENT.fields, 0);
}
function snapMachine(snap, rec) { return snap.eq.findIndex((e) => e.rec === rec); }
function insertMove(snap, m) {
  let i = snap.mv.findIndex((x) => (x[0] || '') <= m[0]); if (i < 0) i = snap.mv.length;
  snap.mv.splice(i, 0, m); if (m[2] >= 0) snap.stats.matched++;
}
const moveFields = (e, v, by) => {
  const M = MOVES.fields;
  const type = MOVE_TYPE_MAP[e.ty] || (MOVE_TYPES.includes(e.ty) ? e.ty : null);
  return {
    [M.equipment]: e.id, [M.date]: v.date, [M.from]: v.from || '', [M.to]: v.to, [M.status]: v.status,
    [M.driver]: v.driver || '', [M.truck]: v.truck || '', [M.permit]: v.permit || 'n/a', [M.enteredBy]: by,
    ...(type ? { [M.type]: type } : {}),
  };
};
const locConflict = (e, cur) => new EditError(409,
  `${e.id}'s Location was changed to ${cur || 'nothing'} by someone else since you opened it. Close this, tap Refresh, and try again.`, { current: { loc: cur } });

// ---------- add a move ----------
export async function addMove(deps, user, b) {
  const { log, keepUndo, patch } = ctx(deps, user);
  const v = { from: clean(b.from), to: clean(b.to), date: b.date, driver: clean(b.driver, 60), truck: clean(b.truck, 30), permit: clean(b.permit, 40), status: b.status };
  if (!b.rec) bad('Pick the machine that moved.');
  if (!v.to) bad('Pick where it went.');
  if (!isDate(v.date)) bad('Enter the date of the move.');
  if (!['Complete', 'Scheduled', 'Need'].includes(v.status)) bad('Pick Complete, Scheduled or Need.');
  const e = await currentMachine(deps, b.rec);
  const done = v.status === 'Complete';
  if (done && (b.expectLoc ?? '') !== e.loc) throw locConflict(e, e.loc);

  const [mv] = await deps.airtable.create(MOVES.table, [moveFields(e, v, user.name)]);
  const ops = [{ k: 'del', table: MOVES.table, ids: [mv.id] }];
  const rows = [{ equipment: e.id, change: done ? 'Move' : `Move (${v.status})`, from: v.from, to: v.to, record: mv.id }];
  const moveLoc = done && e.loc !== v.to;
  if (moveLoc) {
    await deps.airtable.update(EQUIPMENT.table, e.rec, { [EQUIPMENT.fields.location]: v.to });
    ops.push({ k: 'set', table: EQUIPMENT.table, rec: e.rec, fields: { [EQUIPMENT.fields.location]: e.loc || null } });
    rows.push({ equipment: e.id, change: 'Location', from: e.loc, to: v.to, record: e.rec });
  }
  ops.push({ k: 'del', table: CHANGE_LOG.table, ids: await log(rows) });
  await patch((snap) => {
    const i = snapMachine(snap, e.rec);
    insertMove(snap, [v.date, e.id, i, v.from, v.to, v.driver, v.truck, v.permit || 'n/a', v.status, '', '', mv.id, user.name]);
    if (moveLoc && i >= 0) snap.eq[i].loc = v.to;
  });
  return { id: mv.id, undo: await keepUndo(ops) };
}

// ---------- mark a scheduled or needed move done ----------
export async function moveDone(deps, user, b) {
  const { log, keepUndo, patch } = ctx(deps, user);
  if (!b.move) bad('That move has no Airtable record. Mark it done in Airtable.');
  if (!isDate(b.date)) bad('Enter the date it moved.');
  const M = MOVES.fields;
  const rec = await deps.airtable.getRecord(MOVES.table, b.move);
  const f = rec.fields || {};
  const status = typeof f[M.status] === 'object' ? f[M.status]?.name : f[M.status];
  if (status === 'Complete') throw new EditError(409, 'Someone already marked this move done. Tap Refresh to see it.');
  const to = String(f[M.to] || '').trim() || clean(b.to);
  await deps.airtable.update(MOVES.table, b.move, { [M.status]: 'Complete', [M.date]: b.date });
  const ops = [{ k: 'set', table: MOVES.table, rec: b.move, fields: { [M.status]: status || null, [M.date]: f[M.date] || null } }];
  const rows = [{ equipment: String(f[M.equipment] || ''), change: 'Move marked done', from: String(f[M.from] || ''), to, record: b.move }];
  let e = null;
  if (b.rec) {
    e = await currentMachine(deps, b.rec);
    if (to && e.loc !== to) {
      await deps.airtable.update(EQUIPMENT.table, e.rec, { [EQUIPMENT.fields.location]: to });
      ops.push({ k: 'set', table: EQUIPMENT.table, rec: e.rec, fields: { [EQUIPMENT.fields.location]: e.loc || null } });
      rows.push({ equipment: e.id, change: 'Location', from: e.loc, to, record: e.rec });
    } else e = null;
  }
  ops.push({ k: 'del', table: CHANGE_LOG.table, ids: await log(rows) });
  await patch((snap) => {
    const j = snap.mv.findIndex((m) => m[11] === b.move);
    if (j >= 0) { const [m] = snap.mv.splice(j, 1); m[0] = b.date; m[8] = 'Complete'; if (m[2] >= 0) snap.stats.matched--; insertMove(snap, m); }
    if (e) { const i = snapMachine(snap, e.rec); if (i >= 0) snap.eq[i].loc = to; }
  });
  return { ok: true, undo: await keepUndo(ops) };
}

// ---------- edit a machine ----------
function toAirtable(k, v) {
  if (k === 'tk') return v === true || v === 'true';
  if (k === 'dl') return (v || []).map(String);
  const s = String(v ?? '').trim();
  return ['loc', 'st', 'ty'].includes(k) ? s || null : s;
}
export async function editMachine(deps, user, b) {
  const { log, keepUndo, patch } = ctx(deps, user);
  const set = b.set || {}, expect = b.expect || {};
  const keys = Object.keys(set);
  if (!b.rec || !keys.length) bad('Nothing to save.');
  for (const k of keys) if (!EDITABLE[k]) bad(`${k} can't be changed here.`);
  if (set.yr && !/^(19|20)\d\d$/.test(String(set.yr).trim())) bad('Year should be four digits, like 2019.');
  const e = await currentMachine(deps, b.rec);
  const changedElsewhere = keys.filter((k) => k in expect && !same(e[k], expect[k]));
  if (changedElsewhere.length) {
    throw new EditError(409, `Someone else changed ${changedElsewhere.map((k) => LABEL[k]).join(', ')} on ${e.id} since you opened it. Close this, tap Refresh, and make your change again.`,
      { current: Object.fromEntries(changedElsewhere.map((k) => [k, e[k]])) });
  }
  const F = EQUIPMENT.fields;
  const fields = Object.fromEntries(keys.map((k) => [F[EDITABLE[k]], toAirtable(k, set[k])]));
  const undoFields = Object.fromEntries(keys.map((k) => [F[EDITABLE[k]], toAirtable(k, e[k])]));
  await deps.airtable.update(EQUIPMENT.table, e.rec, fields);
  const ops = [{ k: 'set', table: EQUIPMENT.table, rec: e.rec, fields: undoFields }];
  const rows = keys.map((k) => ({ equipment: e.id, change: LABEL[k], from: show(k, e[k]), to: show(k, set[k]), record: e.rec }));
  let moveId = null;
  const logMove = b.logMove && 'loc' in set && e.loc && set.loc && e.loc !== set.loc;
  if (logMove) {
    const date = isDate(b.date) ? b.date : new Date(deps.now()).toISOString().slice(0, 10);
    const [mv] = await deps.airtable.create(MOVES.table, [moveFields(e, { from: e.loc, to: set.loc, date, status: 'Complete' }, user.name)]);
    moveId = mv.id;
    ops.push({ k: 'del', table: MOVES.table, ids: [mv.id] });
    rows.push({ equipment: e.id, change: 'Move', from: e.loc, to: set.loc, record: mv.id });
    b.date = date;
  }
  ops.push({ k: 'del', table: CHANGE_LOG.table, ids: await log(rows) });
  await patch((snap) => {
    const i = snapMachine(snap, e.rec); if (i < 0) return;
    for (const k of keys) snap.eq[i][k] = k === 'dl' ? (set[k] || []) : k === 'tk' ? toAirtable('tk', set[k]) : String(set[k] ?? '').trim();
    if (logMove) insertMove(snap, [b.date, e.id, i, e.loc, set.loc, '', '', 'n/a', 'Complete', '', '', moveId, user.name]);
  });
  return { ok: true, moveId, undo: await keepUndo(ops) };
}

// ---------- add a machine ----------
export async function addMachine(deps, user, b) {
  const { log, keepUndo, patch } = ctx(deps, user);
  const id = clean(b.id, 40).toUpperCase();
  if (!id) bad('Enter the Equipment ID.');
  if (!b.ty) bad('Pick a Type, so the machine shows up on Jobsites and Fleet.');
  const snap = await deps.store.get('snapshot');
  const dup = snap?.eq.find((x) => idKey(x.id) === idKey(id));
  if (dup) throw new EditError(409, `${dup.id} already exists${dup.old ? ' in Old Equipment' : ''}. Open it from Fleet to edit it.`);
  const F = EQUIPMENT.fields;
  const fields = { [F.id]: id, [F.tracking]: b.tk !== false }; // new machines are tracked unless unticked
  for (const k of Object.keys(EDITABLE)) if (k !== 'tk' && b[k] != null && (Array.isArray(b[k]) ? b[k].length : String(b[k]).trim())) fields[F[EDITABLE[k]]] = toAirtable(k, b[k]);
  const [rec] = await deps.airtable.create(EQUIPMENT.table, [fields]);
  const logIds = await log([{ equipment: id, change: 'Added machine', to: b.loc ? `at ${b.loc}` : '', record: rec.id }]);
  await patch((s) => { s.eq.push(machine(rec, F, 0)); });
  return { rec: rec.id, undo: await keepUndo([{ k: 'del', table: EQUIPMENT.table, ids: [rec.id] }, { k: 'del', table: CHANGE_LOG.table, ids: logIds }]) };
}

// ---------- add a photo or PDF ----------
export async function addFile(deps, user, b) {
  const { log, keepUndo, patch } = ctx(deps, user);
  const name = clean(b.name, 120) || 'file';
  if (!b.rec || !b.data) bad('No file was sent.');
  if (!/^(image\/(jpeg|png|heic|heif|webp|gif)|application\/pdf)$/.test(b.type || '')) bad('Only photos and PDFs can be added here.');
  if (b.data.length * 0.75 > 5e6) bad(`${name} is over 5 MB. Airtable won't take files that large from the app.`);
  const e = await currentMachine(deps, b.rec);
  const before = new Set(e.f.map((f) => f.id));
  const out = await deps.airtable.upload(e.rec, EQUIPMENT.fields.files, { contentType: b.type, filename: name, file: b.data });
  const after = files(out.fields?.[EQUIPMENT.fields.files] || out.fields?.Attachment || []);
  const added = after.find((f) => !before.has(f.id));
  if (!added) throw new EditError(502, 'Airtable took the file but didn\'t say where it went. Tap Refresh to check.');
  const logIds = await log([{ equipment: e.id, change: 'Added file', to: name, record: e.rec }]);
  await patch((s) => { const i = snapMachine(s, e.rec); if (i >= 0) s.eq[i].f.push(added); });
  return { id: added.id, undo: await keepUndo([{ k: 'unattach', rec: e.rec, id: added.id }, { k: 'del', table: CHANGE_LOG.table, ids: logIds }]) };
}

// ---------- edit a move ----------
const MOVE_KEYS = ['date', 'eq', 'from', 'to', 'status', 'driver', 'truck', 'permit'];
const MOVE_LABEL = { date: 'Date', eq: 'Machine', from: 'From', to: 'To', status: 'Status', driver: 'Driver', truck: 'Truck', permit: 'Permit' };
function moveValues(rec) {
  const f = rec.fields || {}, M = MOVES.fields;
  return { date: text(f[M.date]), eq: text(f[M.equipment]), from: text(f[M.from]), to: text(f[M.to]), status: text(f[M.status]),
    driver: text(f[M.driver]), truck: text(f[M.truck]), permit: text(f[M.permit]) };
}
export async function editMove(deps, user, b) {
  const { log, keepUndo, patch } = ctx(deps, user);
  const set = b.set || {}, expect = b.expect || {};
  const keys = Object.keys(set).filter((k) => MOVE_KEYS.includes(k));
  if (!b.move) bad('That move has no Airtable record. Edit it in Airtable.');
  if (!keys.length) bad('Nothing to save.');
  if ('date' in set && !isDate(set.date)) bad('Enter the date of the move.');
  if ('status' in set && !['Complete', 'Scheduled', 'Need'].includes(set.status)) bad('Pick Complete, Scheduled or Need.');
  if ('to' in set && !clean(set.to)) bad('Pick where it went.');
  if ('eq' in set && !b.eqRec) bad('Pick the machine that moved.');
  const M = MOVES.fields;
  const cur = moveValues(await deps.airtable.getRecord(MOVES.table, b.move));
  const changedElsewhere = keys.filter((k) => k in expect && !same(cur[k], String(expect[k] ?? '').trim()));
  if (changedElsewhere.length) throw new EditError(409, `Someone else changed ${changedElsewhere.map((k) => MOVE_LABEL[k]).join(', ')} on this move since you opened it. Close this, tap Refresh, and try again.`);
  const newEq = 'eq' in set ? await currentMachine(deps, b.eqRec) : null;
  // Optional: also fix the machine's Location to match the edited move.
  let locE = null;
  if (b.setLoc?.rec && b.setLoc.to) {
    locE = await currentMachine(deps, b.setLoc.rec);
    if ((b.setLoc.from ?? '') !== locE.loc) throw locConflict(locE, locE.loc);
  }
  const val = { ...Object.fromEntries(keys.map((k) => [k, clean(set[k], 60)])) };
  if (newEq) val.eq = newEq.id;
  if ('permit' in val && !val.permit) val.permit = 'n/a';
  const FIELD = { date: M.date, eq: M.equipment, from: M.from, to: M.to, status: M.status, driver: M.driver, truck: M.truck, permit: M.permit };
  const fields = Object.fromEntries(keys.map((k) => [FIELD[k], val[k]]));
  if (newEq) { const type = MOVE_TYPE_MAP[newEq.ty] || (MOVE_TYPES.includes(newEq.ty) ? newEq.ty : null); if (type) fields[M.type] = type; }
  await deps.airtable.update(MOVES.table, b.move, fields);
  const back = Object.fromEntries(keys.map((k) => [FIELD[k], k === 'status' ? cur[k] || null : cur[k]]));
  const ops = [{ k: 'set', table: MOVES.table, rec: b.move, fields: back }];
  const summary = (o) => keys.map((k) => `${MOVE_LABEL[k]}: ${o[k] || '(blank)'}`).join('\n');
  const rows = [{ equipment: val.eq || cur.eq, change: 'Move edited', from: summary(cur), to: summary(val), record: b.move }];
  if (locE && locE.loc !== b.setLoc.to) {
    await deps.airtable.update(EQUIPMENT.table, locE.rec, { [EQUIPMENT.fields.location]: b.setLoc.to });
    ops.push({ k: 'set', table: EQUIPMENT.table, rec: locE.rec, fields: { [EQUIPMENT.fields.location]: locE.loc || null } });
    rows.push({ equipment: locE.id, change: 'Location', from: locE.loc, to: b.setLoc.to, record: locE.rec });
  }
  ops.push({ k: 'del', table: CHANGE_LOG.table, ids: await log(rows) });
  await patch((snap) => {
    const j = snap.mv.findIndex((m) => m[11] === b.move);
    if (j >= 0) {
      const [m] = snap.mv.splice(j, 1);
      if (m[2] >= 0) snap.stats.matched--;
      const COL = { date: 0, from: 3, to: 4, driver: 5, truck: 6, permit: 7, status: 8 };
      for (const k of keys) if (k in COL) m[COL[k]] = val[k];
      if ('from' in val) m[9] = ''; if ('to' in val) m[10] = '';
      if (newEq) { m[1] = newEq.id; m[2] = snapMachine(snap, newEq.rec); }
      insertMove(snap, m);
    }
    if (locE) { const i = snapMachine(snap, locE.rec); if (i >= 0) snap.eq[i].loc = b.setLoc.to; }
  });
  return { ok: true, undo: await keepUndo(ops) };
}

// ---------- undo ----------
export async function undo(deps, user, b) {
  const key = `undo/${String(b.token || '').replace(/[^\w-]/g, '')}`;
  const u = await deps.store.get(key);
  if (!u || !u.ops) throw new EditError(410, 'Too late to undo here. Change it back with Edit, or in Airtable.');
  if (deps.now() - u.at > UNDO_MINUTES * 60e3) throw new EditError(410, `Undo only works for ${UNDO_MINUTES} minutes. Change it back with Edit, or in Airtable.`);
  await deps.store.set(key, { at: 0 });
  for (const op of [...u.ops].reverse()) {
    if (op.k === 'del') await deps.airtable.destroy(op.table, op.ids);
    else if (op.k === 'set') await deps.airtable.update(op.table, op.rec, op.fields);
    else if (op.k === 'unattach') {
      const r = await deps.airtable.getRecord(EQUIPMENT.table, op.rec);
      const keep = (r.fields?.[EQUIPMENT.fields.files] || []).filter((a) => a.id !== op.id).map((a) => ({ id: a.id }));
      await deps.airtable.update(EQUIPMENT.table, op.rec, { [EQUIPMENT.fields.files]: keep });
    }
  }
  // Put the saved copy back too, so nobody sees the undone change in the meantime.
  await deps.store.set('last-edit', { at: deps.now() });
  const snap = await deps.store.get('snapshot');
  if (snap) {
    undoInCopy(snap, u.ops);
    snap.asOf = Math.max(deps.now(), (snap.asOf || 0) + 1);
    snap.rev = randomBytes(6).toString('base64url');
    await deps.store.set('snapshot', snap);
  }
  return { ok: true };
}

const KEY_FOR_FIELD = Object.fromEntries(Object.entries(EDITABLE).map(([k, name]) => [EQUIPMENT.fields[name], k]));
function undoInCopy(snap, ops) {
  // Restored From/To values are grouped under one site name, like a refresh does.
  const counts = new Map();
  for (const m of snap.mv) for (const s of [m[3], m[4]]) if (s) counts.set(s, (counts.get(s) || 0) + 1);
  const site = makeSiteNamer([...new Set([...snap.eq.filter((e) => !e.old && e.loc).map((e) => e.loc), ...[...counts].filter(([, n]) => n >= 20).map(([s]) => s)])]);
  for (const op of ops) {
    if (op.k === 'del' && op.table === CHANGE_LOG.table) snap.log = (snap.log || []).filter((x) => !op.ids.includes(x.lid));
    else if (op.k === 'del' && op.table === MOVES.table) {
      const n = snap.mv.length; snap.mv = snap.mv.filter((m) => !op.ids.includes(m[11])); snap.stats.matched -= n - snap.mv.length;
    } else if (op.k === 'del' && op.table === EQUIPMENT.table) {
      for (const rec of op.ids) {
        const i = snap.eq.findIndex((e) => e.rec === rec); if (i < 0) continue;
        snap.eq.splice(i, 1);
        for (const m of snap.mv) { if (m[2] === i) m[2] = -1; else if (m[2] > i) m[2]--; }
      }
    } else if (op.k === 'set' && op.table === EQUIPMENT.table) {
      const e = snap.eq.find((x) => x.rec === op.rec); if (!e) continue;
      for (const [fid, v] of Object.entries(op.fields)) { const k = KEY_FOR_FIELD[fid]; if (k) e[k] = k === 'dl' ? (v || []) : k === 'tk' ? v === true : String(v ?? ''); }
    } else if (op.k === 'set' && op.table === MOVES.table) {
      const m = snap.mv.find((x) => x[11] === op.rec); if (!m) continue;
      const M = MOVES.fields;
      const COL = { [M.date]: 0, [M.from]: 3, [M.to]: 4, [M.driver]: 5, [M.truck]: 6, [M.permit]: 7, [M.status]: 8 };
      for (const [fid, v] of Object.entries(op.fields)) if (fid in COL) m[COL[fid]] = String(v ?? '');
      for (const [fid, c, raw] of [[M.from, 3, 9], [M.to, 4, 10]]) if (fid in op.fields) { const r = m[c]; m[c] = site(r); m[raw] = m[c] !== r ? r : ''; }
      if (M.equipment in op.fields) {
        const was = m[2] >= 0;
        m[1] = String(op.fields[M.equipment] ?? '');
        const k = idKey(m[1]);
        m[2] = snap.eq.findIndex((e) => !e.old && idKey(e.id) === k);
        if (m[2] < 0) m[2] = snap.eq.findIndex((e) => idKey(e.id) === k);
        snap.stats.matched += (m[2] >= 0) - was;
      }
      snap.mv.sort((a, b) => (b[0] || '').localeCompare(a[0] || ''));
    } else if (op.k === 'unattach') {
      const e = snap.eq.find((x) => x.rec === op.rec); if (e) e.f = e.f.filter((f) => f.id !== op.id);
    }
  }
}
