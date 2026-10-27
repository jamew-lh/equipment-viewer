import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../lib/app.mjs';
import { syncNow } from '../lib/sync.mjs';
import { memoryStore } from '../lib/store.mjs';
import { fakeAirtable } from './fake-airtable.mjs';
import { EQUIPMENT, MOVES, CHANGE_LOG } from '../lib/config.mjs';

const env = { AIRTABLE_TOKEN: 'patX', SESSION_SECRET: 's'.repeat(32), VIEWER_PIN: '2468', OFFICE_PIN: 'OFFICE99' };
const E = EQUIPMENT.fields, M = MOVES.fields, L = CHANGE_LOG.fields;

async function setup(over = {}) {
  let t = Date.parse('2026-10-14T16:00:00Z');
  const deps = { env, store: memoryStore(), airtable: fakeAirtable(over.at), now: () => t, ip: '1.2.3.4', log: () => {}, syncs: 0, triggerSync: async () => { deps.syncs++; } };
  await syncNow(deps);
  const call = async (path, { method = 'GET', body, cookie } = {}) => {
    const r = await handle(new Request(`https://x.test${path}`, { method, body: body && JSON.stringify(body), headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' } }), deps);
    return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };
  const office = async (name = 'James W') => {
    const a = await call('/api/login', { method: 'POST', body: { pin: 'OFFICE99' } });
    assert.equal(a.body.needName, true);
    return (await call('/api/login/name', { method: 'POST', body: { name }, cookie: a.cookie })).cookie;
  };
  const viewer = async () => (await call('/api/login', { method: 'POST', body: { pin: '2468' } })).cookie;
  const data = async (cookie) => (await call('/api/data', { cookie })).body;
  const rec = (table, id) => deps.airtable.data[table].find((r) => r.id === id);
  const byId = (id) => deps.airtable.data[EQUIPMENT.table].find((r) => r.fields[E.id] === id);
  return { deps, call, office, viewer, data, rec, byId, advance: (ms) => { t += ms; } };
}

test('office sign-in asks for a name; viewers and half-signed-in sessions cannot save', async () => {
  const { call, office, viewer, data, byId } = await setup();
  const half = (await call('/api/login', { method: 'POST', body: { pin: 'OFFICE99' } })).cookie;
  assert.equal((await call('/api/data', { cookie: half })).status, 401);
  const v = await viewer();
  assert.equal((await data(v)).office, null);
  const body = { rec: byId('336-05').id, expectLoc: 'Valley Suburban', to: 'TOA 3', from: 'Valley Suburban', date: '2026-10-14', status: 'Complete' };
  assert.equal((await call('/api/moves', { method: 'POST', body, cookie: v })).status, 403);
  const o = await office();
  assert.deepEqual((await data(o)).office, { name: 'James W' });
  assert.ok((await data(o)).choices.loc.includes('TOA 3'));
  assert.ok(!(await data(o)).choices.loc.includes('hb'), 'partial leftovers like "hb" are left out');
});

test('changing OFFICE_PIN signs the office out but not viewers', async () => {
  const { call, office, viewer, deps } = await setup();
  const o = await office(), v = await viewer();
  deps.env = { ...env, OFFICE_PIN: 'NEWPIN11' };
  assert.equal((await call('/api/data', { cookie: o })).status, 401);
  assert.equal((await call('/api/data', { cookie: v })).status, 200);
});

test('a completed move is saved, sets Location, is logged, and shows for everyone', async () => {
  const { call, office, viewer, data, rec, byId, deps } = await setup();
  const o = await office();
  const m = byId('336-05');
  const r = await call('/api/moves', { method: 'POST', cookie: o, body: { rec: m.id, expectLoc: 'Valley Suburban', from: 'Valley Suburban', to: 'TOA 3', date: '2026-10-14', driver: 'Jared E', truck: '16-02', permit: '', status: 'Complete' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const mv = rec(MOVES.table, r.body.id);
  assert.equal(mv.fields[M.equipment], '336-05');
  assert.equal(mv.fields[M.to], 'TOA 3');
  assert.equal(mv.fields[M.enteredBy], 'James W');
  assert.equal(mv.fields[M.permit], 'n/a');
  assert.equal(mv.fields[M.type], 'Excavator');
  assert.equal(rec(EQUIPMENT.table, m.id).fields[E.location], 'TOA 3');
  const log = deps.airtable.data[CHANGE_LOG.table];
  assert.deepEqual(log.map((x) => x.fields[L.change]), ['Move', 'Location']);
  assert.equal(log[1].fields[L.from], 'Valley Suburban');
  assert.equal(log[1].fields[L.who], 'James W');
  // A viewer loading now sees it, without waiting for a refresh.
  const d = await data(await viewer());
  const i = d.eq.findIndex((e) => e.id === '336-05');
  assert.equal(d.eq[i].loc, 'TOA 3');
  assert.deepEqual(d.mv.find((x) => x[11] === r.body.id).slice(0, 5), ['2026-10-14', '336-05', i, 'Valley Suburban', 'TOA 3']);
});

test('a scheduled move leaves Location alone until it is marked done', async () => {
  const { call, office, rec, byId } = await setup();
  const o = await office(); const m = byId('D6T-03');
  const r = await call('/api/moves', { method: 'POST', cookie: o, body: { rec: m.id, expectLoc: '1201 Colllegeville', from: '1201 Colllegeville', to: 'Odessa', date: '2026-10-20', status: 'Scheduled' } });
  assert.equal(r.status, 200);
  assert.equal(rec(EQUIPMENT.table, m.id).fields[E.location], '1201 Colllegeville');
  const d = await call('/api/moves/done', { method: 'POST', cookie: o, body: { move: r.body.id, rec: m.id, to: 'Odessa', date: '2026-10-19' } });
  assert.equal(d.status, 200);
  assert.equal(rec(MOVES.table, r.body.id).fields[M.status], 'Complete');
  assert.equal(rec(MOVES.table, r.body.id).fields[M.date], '2026-10-19');
  assert.equal(rec(EQUIPMENT.table, m.id).fields[E.location], 'Odessa');
  const again = await call('/api/moves/done', { method: 'POST', cookie: o, body: { move: r.body.id, rec: m.id, to: 'Odessa', date: '2026-10-19' } });
  assert.equal(again.status, 409);
});

test('a move is refused if someone changed the Location since the form opened', async () => {
  const { call, office, rec, byId, deps } = await setup();
  const o = await office(); const m = byId('336-05');
  rec(EQUIPMENT.table, m.id).fields[E.location] = 'Odessa'; // changed directly in Airtable
  const r = await call('/api/moves', { method: 'POST', cookie: o, body: { rec: m.id, expectLoc: 'Valley Suburban', from: 'Valley Suburban', to: 'TOA 3', date: '2026-10-14', status: 'Complete' } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /changed to Odessa/);
  assert.equal(deps.airtable.calls.filter((c) => c[0] === 'create').length, 0, 'nothing was written');
});

test('editing saves only what changed, refuses to overwrite someone else, and can log a move', async () => {
  const { call, office, rec, byId, deps, data } = await setup();
  const o = await office('Kim B'); const m = byId('340-01');
  let r = await call('/api/machines', { method: 'PATCH', cookie: o, body: { rec: m.id, expect: { st: 'In Service', loc: 'Odessa', dl: ['FOLEY'] }, set: { st: 'Down for Maintenance', loc: 'TOA 3', dl: ['FOLEY', 'G&R'] }, logMove: true, date: '2026-10-14' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const f = rec(EQUIPMENT.table, m.id).fields;
  assert.equal(f[E.status], 'Down for Maintenance');
  assert.equal(f[E.location], 'TOA 3');
  assert.deepEqual(f[E.dealer], ['FOLEY', 'G&R']);
  assert.equal(rec(MOVES.table, r.body.moveId).fields[M.from], 'Odessa');
  assert.equal(deps.airtable.data[CHANGE_LOG.table].length, 4);
  assert.equal((await data(o)).eq.find((e) => e.id === '340-01').st, 'Down for Maintenance');
  // Someone else's old form: expects In Service, but it's now Down for Maintenance.
  r = await call('/api/machines', { method: 'PATCH', cookie: o, body: { rec: m.id, expect: { st: 'In Service' }, set: { st: 'Out of Service' } } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Status/);
  assert.equal(rec(EQUIPMENT.table, m.id).fields[E.status], 'Down for Maintenance');
  r = await call('/api/machines', { method: 'PATCH', cookie: o, body: { rec: m.id, expect: {}, set: { yr: '22' } } });
  assert.equal(r.status, 400);
  r = await call('/api/machines', { method: 'PATCH', cookie: o, body: { rec: m.id, expect: {}, set: { rec: 'x' } } });
  assert.equal(r.status, 400);
});

test('undo puts everything back, including the move and change log rows', async () => {
  const { call, office, rec, byId, deps } = await setup();
  const o = await office(); const m = byId('336-05');
  const before = deps.airtable.data[MOVES.table].length;
  const r = await call('/api/moves', { method: 'POST', cookie: o, body: { rec: m.id, expectLoc: 'Valley Suburban', from: 'Valley Suburban', to: 'TOA 3', date: '2026-10-14', status: 'Complete' } });
  const u = await call('/api/undo', { method: 'POST', cookie: o, body: { token: r.body.undo } });
  assert.equal(u.status, 200);
  assert.equal(rec(EQUIPMENT.table, m.id).fields[E.location], 'Valley Suburban');
  assert.equal(deps.airtable.data[MOVES.table].length, before);
  assert.equal(deps.airtable.data[CHANGE_LOG.table].length, 0);
  assert.equal(deps.syncs, 1, 'a refresh starts so everyone sees it undone');
  assert.equal((await call('/api/undo', { method: 'POST', cookie: o, body: { token: r.body.undo } })).status, 410, 'only once');
});

test('undo only works for 5 minutes', async () => {
  const { call, office, byId, advance } = await setup();
  const o = await office(); const m = byId('336-05');
  const r = await call('/api/machines', { method: 'PATCH', cookie: o, body: { rec: m.id, expect: { nt: '' }, set: { nt: 'Needs grease' } } });
  advance(6 * 60e3);
  const u = await call('/api/undo', { method: 'POST', cookie: o, body: { token: r.body.undo } });
  assert.equal(u.status, 410);
  assert.match(u.body.error, /5 minutes/);
});

test('adding a machine checks for duplicates and needs a Type', async () => {
  const { call, office, data, deps } = await setup();
  const o = await office();
  assert.equal((await call('/api/machines', { method: 'POST', cookie: o, body: { id: '336-05', ty: 'Excavator' } })).status, 409);
  assert.equal((await call('/api/machines', { method: 'POST', cookie: o, body: { id: '333-02', ty: 'Skid Loader' } })).status, 409, 'IDs in Old Equipment count too');
  assert.equal((await call('/api/machines', { method: 'POST', cookie: o, body: { id: '336-09' } })).status, 400);
  const r = await call('/api/machines', { method: 'POST', cookie: o, body: { id: '336-09', ty: 'Excavator', loc: 'Odessa', mk: 'CAT', md: '336', dl: ['FOLEY'], st: 'In Service' } });
  assert.equal(r.status, 200);
  const e = (await data(o)).eq.find((x) => x.id === '336-09');
  assert.equal(e.loc, 'Odessa'); assert.equal(e.mk, 'CAT'); assert.deepEqual(e.dl, ['FOLEY']);
  const u = await call('/api/undo', { method: 'POST', cookie: o, body: { token: r.body.undo } });
  assert.equal(u.status, 200);
  assert.ok(!deps.airtable.data[EQUIPMENT.table].some((x) => x.id === r.body.rec));
});

test('photos upload to the Attachment field and can be undone', async () => {
  const { call, office, rec, byId, data } = await setup();
  const o = await office(); const m = byId('336-05');
  const had = (rec(EQUIPMENT.table, m.id).fields[E.files] || []).length;
  const big = await call('/api/files', { method: 'POST', cookie: o, body: { rec: m.id, name: 'x.jpg', type: 'image/jpeg', data: 'A'.repeat(7e6) } });
  assert.equal(big.status, 400);
  const exe = await call('/api/files', { method: 'POST', cookie: o, body: { rec: m.id, name: 'x.exe', type: 'application/x-msdownload', data: 'AAAA' } });
  assert.equal(exe.status, 400);
  const r = await call('/api/files', { method: 'POST', cookie: o, body: { rec: m.id, name: 'boom.jpg', type: 'image/jpeg', data: 'AAAA' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(rec(EQUIPMENT.table, m.id).fields[E.files].length, had + 1);
  assert.ok((await data(o)).eq.find((e) => e.id === '336-05').f.some((f) => f[0] === r.body.id));
  assert.equal((await call(`/api/file?r=${m.id}&a=${r.body.id}`, { cookie: o })).status, 302);
  await call('/api/undo', { method: 'POST', cookie: o, body: { token: r.body.undo } });
  assert.equal((rec(EQUIPMENT.table, m.id).fields[E.files] || []).length, had);
});

test('a token without write access gets a clear message and nothing is half-saved', async () => {
  const { call, office, byId } = await setup({ at: { writeFailWith: 403 } });
  const o = await office(); const m = byId('336-05');
  const r = await call('/api/moves', { method: 'POST', cookie: o, body: { rec: m.id, expectLoc: 'Valley Suburban', from: 'Valley Suburban', to: 'TOA 3', date: '2026-10-14', status: 'Complete' } });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /write access/);
});

test('a refresh that started before a save reads again, so the save is not lost', async () => {
  const deps = { store: memoryStore(), airtable: fakeAirtable(), now: () => 1000, log: () => {} };
  let reads = 0;
  const orig = deps.airtable.listAll;
  deps.airtable.listAll = async (...a) => { reads++; if (reads === 1) await deps.store.set('last-edit', { at: 1000 }); return orig(...a); };
  await syncNow(deps);
  assert.ok(reads > 3, 'it read the tables a second time');
  assert.ok(await deps.store.get('snapshot'));
});

test('the change history comes back from the Change Log table after a refresh', async () => {
  const { call, office, viewer, data, byId, deps } = await setup();
  const o = await office('Kim B'); const m = byId('336-05');
  await call('/api/machines', { method: 'PATCH', cookie: o, body: { rec: m.id, expect: { st: 'In Service' }, set: { st: 'Down for Maintenance' } } });
  let log = (await data(await viewer())).log;
  assert.equal(log[0].field, 'Status'); assert.equal(log[0].by, 'Kim B'); assert.equal(log[0].id, '336-05');
  await syncNow(deps);
  log = (await data(await viewer())).log;
  assert.deepEqual([log[0].field, log[0].from, log[0].to, log[0].by], ['Status', 'In Service', 'Down for Maintenance', 'Kim B']);
});

test('after undo, the next person to load sees it undone straight away', async () => {
  const { call, office, viewer, data, byId } = await setup();
  const o = await office(); const m = byId('336-05');
  const before = await data(await viewer());
  const r1 = await call('/api/moves', { method: 'POST', cookie: o, body: { rec: m.id, expectLoc: 'Valley Suburban', from: 'Valley Suburban', to: 'TOA 3', date: '2026-10-14', status: 'Complete' } });
  const r2 = await call('/api/machines', { method: 'PATCH', cookie: o, body: { rec: m.id, expect: { st: 'In Service', dl: ['FOLEY'] }, set: { st: 'Down for Maintenance', dl: [] } } });
  const r3 = await call('/api/machines', { method: 'POST', cookie: o, body: { id: '336-09', ty: 'Excavator', loc: 'Odessa' } });
  for (const r of [r3, r2, r1]) assert.equal((await call('/api/undo', { method: 'POST', cookie: o, body: { token: r.body.undo } })).status, 200);
  const after = await data(await viewer());
  const e = after.eq.find((x) => x.id === '336-05');
  assert.equal(e.loc, 'Valley Suburban'); assert.equal(e.st, 'In Service'); assert.deepEqual(e.dl, ['FOLEY']);
  assert.equal(after.mv.length, before.mv.length);
  assert.equal(after.stats.matched, before.stats.matched);
  assert.ok(!after.eq.some((x) => x.id === '336-09'));
  assert.equal(after.log.length, 0);
});

test('a completed move can be edited, and its Location fixed with it; undo puts both back', async () => {
  const { call, office, viewer, data, rec, byId, deps } = await setup();
  const o = await office();
  const d0 = await data(o);
  const m = d0.mv.find((x) => x[1] === 'D6T-03' && x[8] === 'Complete'); // newest: TOA 3 -> 1201 Colllegeville, 6/11/26
  assert.equal(m[4], '1201 Colllegeville');
  const e = byId('D6T-03');
  const r = await call('/api/moves', { method: 'PATCH', cookie: o, body: {
    move: m[11], expect: { to: m[10] || m[4], date: m[0], driver: m[5] }, set: { to: 'Odessa', date: '2026-06-12', driver: 'Dan I' },
    setLoc: { rec: e.id, from: '1201 Colllegeville', to: 'Odessa' } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const mv = rec(MOVES.table, m[11]).fields;
  assert.deepEqual([mv[M.to], mv[M.date], mv[M.driver]], ['Odessa', '2026-06-12', 'Dan I']);
  assert.equal(rec(EQUIPMENT.table, e.id).fields[E.location], 'Odessa');
  const log = deps.airtable.data[CHANGE_LOG.table];
  assert.equal(log[0].fields[L.change], 'Move edited');
  assert.match(log[0].fields[L.from], /To: 1201 Coll/); // as it was typed in Airtable
  assert.match(log[0].fields[L.to], /To: Odessa/);
  const d1 = await data(await viewer());
  const m1 = d1.mv.find((x) => x[11] === m[11]);
  assert.deepEqual([m1[0], m1[4], m1[5]], ['2026-06-12', 'Odessa', 'Dan I']);
  assert.equal(d1.eq.find((x) => x.id === 'D6T-03').loc, 'Odessa');
  await call('/api/undo', { method: 'POST', cookie: o, body: { token: r.body.undo } });
  assert.equal(rec(MOVES.table, m[11]).fields[M.to], m[10] || m[4]);
  assert.equal(rec(EQUIPMENT.table, e.id).fields[E.location], '1201 Colllegeville');
  const d2 = await data(await viewer());
  assert.deepEqual(d2.mv.find((x) => x[11] === m[11]).slice(0, 9), m.slice(0, 9));
});

test('an unmatched move can be linked to the right machine', async () => {
  const { call, office, data, rec, byId } = await setup();
  const o = await office();
  const d0 = await data(o);
  const m = d0.mv.find((x) => x[2] < 0 && x[1] === 'Disk-01');
  const disc = byId('Disc-01') || byId('DISC-01');
  assert.ok(m && disc, 'test data has an unmatched Disk-01 move and a Disc-01 machine');
  const r = await call('/api/moves', { method: 'PATCH', cookie: o, body: { move: m[11], expect: { eq: m[1] }, set: { eq: 'Disc-01' }, eqRec: disc.id } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(rec(MOVES.table, m[11]).fields[M.equipment], disc.fields[E.id]);
  const d1 = await data(o);
  const m1 = d1.mv.find((x) => x[11] === m[11]);
  assert.equal(d1.eq[m1[2]].id, disc.fields[E.id]);
  assert.equal(d1.stats.matched, d0.stats.matched + 1);
});

test('editing a move refuses to overwrite a change made in Airtable meanwhile', async () => {
  const { call, office, data, rec } = await setup();
  const o = await office();
  const m = (await data(o)).mv.find((x) => x[1] === 'D6T-03');
  rec(MOVES.table, m[11]).fields[M.driver] = 'Kyle S';
  const r = await call('/api/moves', { method: 'PATCH', cookie: o, body: { move: m[11], expect: { driver: m[5] }, set: { driver: 'Dan I' } } });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Driver/);
});

test('TRACKING: new machines start ticked; the office can untick it, and undo ticks it again', async () => {
  const { call, office, data, rec, byId } = await setup();
  const o = await office();
  const r = await call('/api/machines', { method: 'POST', cookie: o, body: { id: '336-09', ty: 'Excavator', loc: 'Odessa' } });
  assert.equal(rec(EQUIPMENT.table, r.body.rec).fields[E.tracking], true);
  assert.equal((await data(o)).eq.find((x) => x.id === '336-09').tk, true);
  const m = byId('336-05');
  assert.equal(m.fields[E.tracking], true);
  const u = await call('/api/machines', { method: 'PATCH', cookie: o, body: { rec: m.id, expect: { tk: true }, set: { tk: false } } });
  assert.equal(u.status, 200, JSON.stringify(u.body));
  assert.ok(!rec(EQUIPMENT.table, m.id).fields[E.tracking]);
  assert.equal((await data(o)).eq.find((x) => x.id === '336-05').tk, false);
  await call('/api/undo', { method: 'POST', cookie: o, body: { token: u.body.undo } });
  assert.equal(rec(EQUIPMENT.table, m.id).fields[E.tracking], true);
  assert.equal((await data(o)).eq.find((x) => x.id === '336-05').tk, true);
});
