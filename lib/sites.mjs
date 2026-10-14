// Site names in Moves are typed by hand ("BWW", "TOA", "Culebrtson").
// This maps each spelling to one site name so history groups correctly.
// To fix a spelling the app gets wrong, add a line to ALIASES:
// the left side is the spelling in lower case with spaces and punctuation removed.

export const ALIASES = {
  bww: 'Brandywine Walk',
  // Kept as typed on purpose, so a close match doesn't swallow them:
  brandywine: 'Brandywine', morgantownfield: 'Morgantown Field', culbertsone: 'Culbertson East',
  toa: 'TOA 3', toa3: 'TOA 3', toaiii: 'TOA 3',
  hb: 'HB Shop', shop: 'HB Shop', siteshop: 'HB Shop',
  ldwb: 'Little Ducklings WB', wbld: 'Little Ducklings WB', ducklings: 'Little Ducklings WB',
  littleducklings: 'Little Ducklings WB', littleduckling: 'Little Ducklings WB', littleducklingwb: 'Little Ducklings WB',
  mtld: 'Morgantown LD', morgantownducklings: 'Morgantown LD', morgantownduckling: 'Morgantown LD',
  cb: 'Cleveland Bros', clevelandbrothers: 'Cleveland Bros', cleveland: 'Cleveland Bros', clevelandbro: 'Cleveland Bros',
  harvest: 'Harvest Run', chestnut: 'Chestnut Ridge', plank: 'Plank Farm', plankfarms: 'Plank Farm',
  greyfarm: 'Gray Farm', kidjoy: 'KidJoy', boot: 'Boot Rd', bootroad: 'Boot Rd',
  scrapyard: 'Scrap', ritchiebros: 'Auction', ritchiebrothers: 'Auction', ritchiebro: 'Auction',
  woodland: 'Woodlands', brandywinesq: 'Brandywine Square',
  '387': '387 Linfield', linfield: '387 Linfield', gracemine: 'Grace Mines',
  unionwalk: 'Union Walk', southview: 'Southview', greenhill: 'Green Hills',
  stanberry: 'Stanbery', stanbury: 'Stanbery', standberry: 'Stanbery',
  threetunrd: 'Three Tun', springmill: 'Spring Mill', newhorizon: 'New Horizons',
  trumark: 'TruMark', tonsoffun: 'Tons of Fun', kimdental: 'Kim Dental',
  rvindustries: 'RV Industries', rv: 'RV Industries',
};

export const siteKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function similarity(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// knownSites: the Location choices from Equipment Info plus spellings used 20+ times in Moves.
export function makeSiteNamer(knownSites) {
  const canon = new Map();
  for (const s of knownSites) if (!canon.has(siteKey(s))) canon.set(siteKey(s), s);
  const keys = [...canon.keys()];
  const cache = new Map();
  return (raw) => {
    raw = String(raw || '').trim();
    if (!raw) return '';
    if (cache.has(raw)) return cache.get(raw);
    const k = siteKey(raw);
    let out;
    if (k.startsWith('1201')) out = canon.get('1201colllegeville') || canon.get('1201collegeville') || '1201 Collegeville';
    else if (k.startsWith('hbsh')) out = 'HB Shop';
    else if (ALIASES[k]) out = ALIASES[k];
    else if (canon.has(k)) out = canon.get(k);
    else if (k.length >= 4) {
      let best = null, score = 0;
      for (const c of keys) { const r = similarity(k, c); if (r > score) { score = r; best = c; } }
      out = score >= 0.8 ? canon.get(best) : raw;
    } else out = raw;
    out = ALIASES[siteKey(out)] || out;
    cache.set(raw, out);
    return out;
  };
}
