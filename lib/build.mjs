// Turns Airtable records into the compact copy the web page loads.
// Location on Equipment Info decides where a machine is now; Moves is history.
import { EQUIPMENT, OLD_EQUIPMENT, MOVES } from './config.mjs';
import { makeSiteNamer, siteKey } from './sites.mjs';

const text = (v) => (v == null ? '' : Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? x.name : x)).join(', ') : typeof v === 'object' ? v.name ?? '' : String(v).trim());
const list = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? x.name : String(x))) : v ? [text(v)] : []);

// "TB20-07 (6)" and "Build-A-Box-01" match "TB20-07" and "BuildABox-01".
export const idKey = (s) => String(s || '').replace(/\(.*?\)/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function files(v) {
  return (Array.isArray(v) ? v : []).map((a) => {
    const t = a.type || '';
    return {
      id: a.id, name: a.filename,
      kind: t.startsWith('image') ? 'photo' : t.includes('pdf') ? 'pdf' : 'file',
      url: a.url, thumb: a.thumbnails?.large?.url || '',
    };
  });
}

function machine(rec, F, old) {
  const f = rec.fields || {};
  return {
    id: text(f[F.id]), rec: rec.id, old,
    loc: text(f[F.location]), st: text(f[F.status]),
    mk: text(f[F.make]), md: text(f[F.model]), ty: text(f[F.type]),
    yr: F.year ? text(f[F.year]) : '',
    sn: text(f[F.serial]), wt: text(f[F.weight]), dl: F.dealer ? list(f[F.dealer]) : [],
    flt: F.filter ? text(f[F.filter]) : '', tooth: F.tooth ? text(f[F.tooth]) : '',
    nt: text(f[F.notes]), f: files(f[F.files]),
  };
}

export function buildSnapshot({ equipment, oldEquipment, moves }, asOf = Date.now()) {
  const eq = [
    ...equipment.map((r) => machine(r, EQUIPMENT.fields, 0)),
    ...oldEquipment.map((r) => machine(r, OLD_EQUIPMENT.fields, 1)),
  ].filter((e) => e.id);
  eq.sort((a, b) => a.old - b.old || a.id.localeCompare(b.id, undefined, { numeric: true }));

  // Current fleet wins over Old Equipment when an ID is in both.
  const byId = new Map();
  eq.forEach((e, i) => { const k = idKey(e.id); if (!byId.has(k) || (eq[byId.get(k)].old && !e.old)) byId.set(k, i); });

  // Known site names: Location choices in use, plus spellings used 20+ times in Moves.
  const M = MOVES.fields;
  const counts = new Map();
  for (const r of moves) for (const k of [M.from, M.to]) { const s = text(r.fields?.[k]); if (s) counts.set(s, (counts.get(s) || 0) + 1); }
  const known = [...new Set(eq.filter((e) => !e.old && e.loc).map((e) => e.loc))];
  const knownKeys = new Set(known.map(siteKey));
  for (const [s, n] of [...counts].sort((a, b) => b[1] - a[1])) if (n >= 20 && !knownKeys.has(siteKey(s))) { known.push(s); knownKeys.add(siteKey(s)); }
  const site = makeSiteNamer(known);

  const mv = moves.map((r) => {
    const f = r.fields || {};
    const raw = text(f[M.equipment]);
    const fr = text(f[M.from]), to = text(f[M.to]);
    const sf = site(fr), st = site(to);
    const n = byId.get(idKey(raw));
    return [text(f[M.date]), raw, n == null ? -1 : n, sf, st, text(f[M.driver]), text(f[M.truck]),
      text(f[M.permit]), text(f[M.status]), sf !== fr ? fr : '', st !== to ? to : ''];
  });
  mv.sort((a, b) => (b[0] || '').localeCompare(a[0] || ''));

  const matched = mv.filter((m) => m[2] >= 0).length;
  return { asOf, eq, mv, stats: { equipment: equipment.length, old: oldEquipment.length, moves: mv.length, matched } };
}
