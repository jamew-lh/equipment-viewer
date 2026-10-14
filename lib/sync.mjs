// Copies Equipment Info, Old Equipment and Moves from Airtable into the store.
import { EQUIPMENT, OLD_EQUIPMENT, MOVES } from './config.mjs';
import { buildSnapshot } from './build.mjs';

export async function syncNow({ airtable, store, now = () => Date.now(), log = () => {} }) {
  const started = now();
  await store.set('sync-lock', { at: started });
  try {
    const equipment = await airtable.listAll(EQUIPMENT.table, Object.values(EQUIPMENT.fields));
    const oldEquipment = await airtable.listAll(OLD_EQUIPMENT.table, Object.values(OLD_EQUIPMENT.fields));
    const moves = await airtable.listAll(MOVES.table, Object.values(MOVES.fields));
    const snap = buildSnapshot({ equipment, oldEquipment, moves }, now());
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
