// Copies Equipment Info, Old Equipment and Moves from Airtable into the store,
// along with the dropdown choices the office edit forms use.
import { EQUIPMENT, OLD_EQUIPMENT, MOVES, CHANGE_LOG } from './config.mjs';
import { buildSnapshot } from './build.mjs';
import { siteKey } from './sites.mjs';
import { randomBytes } from 'node:crypto';

// Airtable's dropdown lists, read from the base's schema. Leftover partial
// choices like "hb" or "syc" (the start of another choice) are left out.
export function choicesFrom(meta, eq) {
  const F = EQUIPMENT.fields;
  const t = meta?.tables?.find((x) => x.id === EQUIPMENT.table);
  const names = (fid) => (t?.fields?.find((f) => f.id === fid)?.options?.choices || []).map((c) => c.name);
  const used = (k) => [...new Set(eq.filter((e) => !e.old).flatMap((e) => (Array.isArray(e[k]) ? e[k] : [e[k]])).filter(Boolean))];
  const pick = (fid, k) => { const n = names(fid); return n.length ? [...new Set([...n, ...used(k)])] : used(k).sort(); };
  const loc = pick(F.location, 'loc');
  const keys = loc.map(siteKey);
  return {
    loc: loc.filter((s, i) => !keys.some((k, j) => j !== i && k.length > keys[i].length && k.startsWith(keys[i]))),
    st: pick(F.status, 'st'), ty: pick(F.type, 'ty'), dl: pick(F.dealer, 'dl'),
  };
}

// The Change Log table, newest first, as the page shows it on each machine.
export function logRows(records) {
  const F = CHANGE_LOG.fields, t = (v) => String(v ?? '');
  return records.map((r) => ({ at: Date.parse(r.fields?.[F.when]) || 0, by: t(r.fields?.[F.who]), rec: t(r.fields?.[F.record]),
    id: t(r.fields?.[F.equipment]), field: t(r.fields?.[F.change]), from: t(r.fields?.[F.from]), to: t(r.fields?.[F.to]) }))
    .sort((a, b) => b.at - a.at).slice(0, 2000);
}

export async function syncNow({ airtable, store, now = () => Date.now(), log = () => {} }) {
  for (let round = 0; round < 3; round++) {
    const started = now();
    await store.set('sync-lock', { at: started });
    try {
      const equipment = await airtable.listAll(EQUIPMENT.table, Object.values(EQUIPMENT.fields));
      const oldEquipment = await airtable.listAll(OLD_EQUIPMENT.table, Object.values(OLD_EQUIPMENT.fields));
      const moves = await airtable.listAll(MOVES.table, Object.values(MOVES.fields).filter(Boolean));
      const changes = await airtable.listAll(CHANGE_LOG.table, Object.values(CHANGE_LOG.fields)).catch(() => []);
      const meta = await airtable.meta?.().catch(() => null);
      const snap = buildSnapshot({ equipment, oldEquipment, moves }, now());
      snap.choices = choicesFrom(meta, snap.eq);
      snap.log = logRows(changes);
      snap.rev = randomBytes(6).toString('base64url');
      // If someone saved a change while this read was running, read again so it isn't lost.
      const edit = await store.get('last-edit');
      if (edit && edit.at >= started && round < 2) { log('A change was saved during the refresh; reading again'); continue; }
      await store.set('snapshot', snap);
      log(`Synced ${equipment.length} machines, ${oldEquipment.length} old, ${moves.length} moves in ${Math.round((now() - started) / 1000)}s`);
      return snap.stats;
    } catch (e) {
      await store.set('sync-error', { at: now(), message: String(e.message || e) });
      throw e;
    } finally {
      await store.set('sync-lock', { at: 0 });
    }
  }
}
