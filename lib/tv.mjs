// The office TV screen: every jobsite and what's on it, plus scheduled and needed
// moves, laid out for one 1920 x 1080 screen. Opened by a NoviSign Embed widget
// at /tv?key=TV_KEY. No sign-in (a signage player can't type a PIN); the long
// key in the link is the password. It only reads.
import { OUT_OF_FLEET_LOCATIONS, OUT_OF_FLEET_STATUSES } from './config.mjs';

// Same order as the Jobsites screen.
const TYPE_ORDER = ['Excavator', 'Dozer', 'Articulating Truck', 'Roller', 'Rubber Tire Loader', 'Track Loader',
  'Skid Loader', 'Backhoe', 'Attachment', 'Trench Box', 'Shoring', 'Manhole Box', 'Stone Box'];
const rank = (t) => (t === 'Bucket' ? 1e4 : TYPE_ORDER.includes(t) ? TYPE_ORDER.indexOf(t) : 1e3);
const SHORT = { 'Articulating Truck': 'Trucks', 'Rubber Tire Loader': 'Loaders', 'Track Loader': 'Track loaders', 'Skid Loader': 'Skid loaders',
  'Trench Box': 'Trench boxes', 'Manhole Box': 'Manhole boxes', 'Stone Box': 'Stone boxes', 'Steel Plate': 'Plates', 'Small Equipment': 'Small equip.',
  Excavator: 'Excavators', Dozer: 'Dozers', Roller: 'Rollers', Backhoe: 'Backhoes', Attachment: 'Attachments', Bucket: 'Buckets',
  Tractor: 'Tractors', Slinger: 'Slingers', Sweeper: 'Sweepers', Scraper: 'Scrapers', Zipper: 'Zippers', Shoring: 'Shoring' };
const HIDDEN_TYPES = ['Generator'];
const nyDate = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(t);

export function buildTv(snap, now) {
  const live = snap.eq.filter((e) => e.ty && !HIDDEN_TYPES.includes(e.ty) && !e.old
    && !OUT_OF_FLEET_LOCATIONS.includes(e.loc) && !OUT_OF_FLEET_STATUSES.includes(e.st));
  const bySite = new Map();
  for (const e of live) { const s = e.loc || 'No location set'; if (!bySite.has(s)) bySite.set(s, []); bySite.get(s).push(e); }
  const sites = [...bySite].map(([name, list]) => {
    const g = new Map();
    for (const e of list) { if (!g.has(e.ty)) g.set(e.ty, []); g.get(e.ty).push(e); }
    return {
      name, count: list.length, down: list.filter((e) => e.st === 'Down for Maintenance').length,
      groups: [...g].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])).map(([type, items]) => ({
        type: SHORT[type] || type,
        items: items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
          .map((e) => ({ id: e.id, st: e.st === 'Down for Maintenance' ? 'down' : e.st && e.st !== 'In Service' ? 'other' : '' })),
      })),
    };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const today = nyDate(now);
  const mv = (m) => ({ date: m[0], id: m[2] >= 0 ? snap.eq[m[2]].id : m[1], from: m[3], to: m[4], driver: m[5], status: m[8] });
  const open = snap.mv.filter((m) => m[8] === 'Scheduled' || m[8] === 'Need').map(mv).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return { asOf: snap.asOf, total: live.length, sites, open, today };
}

export const tvPage = (key) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>LH Equipment · Office screen</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&family=JetBrains+Mono:wght@500;700&display=swap">
<style>
/* One fixed 1920x1080 stage, scaled to whatever screen shows it. */
:root{--green:#004745;--tan:#D4A070;--tan-soft:#f6ebdd;--ink:#1e2a2a;--muted:#56635f;--line:#d3dbd8;--field:#f4f7f6;--down:#a5401b;--down-soft:#fbe6dc;--s:1;
  --sans:"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;color-scheme:light}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;height:100%;background:#fff;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;font-family:var(--sans);color:var(--ink)}
#stage{width:1920px;height:1080px;flex:none;transform-origin:center center;display:grid;grid-template-rows:96px 1fr;background:#fff}
header{display:flex;align-items:center;gap:28px;padding:0 36px;border-bottom:5px solid var(--tan)}
header img{height:62px}
header h1{margin:0;font:800 34px var(--sans);font-stretch:118%;color:var(--green);letter-spacing:.01em}
header .ct{font:700 22px var(--sans);color:var(--muted)}
header .ct b{color:var(--ink)}
header .right{margin-left:auto;text-align:right;line-height:1.15}
#clock{font:700 34px var(--sans);font-variant-numeric:tabular-nums;color:var(--ink)}
#upd{font:500 16px var(--sans);color:var(--muted)}
#upd.stale{color:var(--down);font-weight:700}
.body{display:grid;grid-template-columns:minmax(0,1fr) 460px;min-height:0;overflow:hidden}
.sitewrap{padding:20px 22px 18px 30px;min-height:0;min-width:0;position:relative;overflow:hidden}
#sites{height:100%;display:flex;gap:16px;align-items:flex-start;overflow:hidden}
#sites .col{flex:1;min-width:0;display:flex;flex-direction:column;gap:14px}
#measure{position:absolute;left:0;top:0;visibility:hidden;display:flex;flex-direction:column;gap:14px}
.site{border:1.5px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.site h2{margin:0;display:flex;justify-content:space-between;align-items:baseline;gap:8px;background:var(--green);color:#fff;padding:calc(6px*var(--s)) 12px;font:800 calc(19px*var(--s)) var(--sans);font-stretch:112%}
.site h2 span{font:800 calc(20px*var(--s)) var(--sans);color:var(--tan);font-variant-numeric:tabular-nums}
.grp{display:grid;grid-template-columns:calc(96px*var(--s)) minmax(0,1fr);gap:2px 8px;padding:calc(5px*var(--s)) 10px;border-top:1px solid var(--line)}
.grp:first-of-type{border-top:none}
.grp .t{font:700 calc(12px*var(--s)) var(--sans);font-stretch:112%;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);padding-top:calc(3px*var(--s))}
.ids{display:flex;flex-wrap:wrap;gap:calc(3px*var(--s)) calc(5px*var(--s))}
.id{font:600 calc(15.5px*var(--s)) var(--mono);padding:1px calc(5px*var(--s));border-radius:5px;background:var(--field);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.id.down{background:var(--down);color:#fff}
.id.other{background:var(--tan-soft)}
.grp.bk .id{font-size:calc(13px*var(--s));background:none;padding:1px 2px;color:var(--muted)}
aside{border-left:1.5px solid var(--line);background:var(--field);padding:20px 24px 16px;display:flex;flex-direction:column;gap:14px;min-height:0;overflow:hidden}
aside h3{margin:0;font:800 15px var(--sans);font-stretch:118%;letter-spacing:.1em;text-transform:uppercase;color:var(--green);display:flex;align-items:center;gap:10px}
aside h3::after{content:"";flex:1;height:2px;background:var(--tan)}
aside h3 b{font-size:20px;color:var(--ink);letter-spacing:0}
.mvs{display:flex;flex-direction:column;gap:10px;min-height:0;flex:1;overflow:hidden}
.mv{background:#fff;border:1.5px solid var(--line);border-radius:9px;padding:8px 12px;display:grid;grid-template-columns:auto 1fr;gap:1px 12px;align-items:baseline}
.mv.sched{border-left:6px solid var(--tan)}
.mv.need{border-left:6px solid var(--down)}
.mv .d{font:700 15px var(--mono);color:var(--muted);white-space:nowrap}
.mv .e{font:700 19px var(--mono)}
.mv .r{grid-column:1/-1;font:600 17px var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mv .r .ar{color:var(--tan);font-weight:800;margin:0 6px}
.mv .w{grid-column:1/-1;font:500 13.5px var(--sans);color:var(--muted)}
.mv .w b{color:var(--down)}
.none{color:var(--muted);font-size:17px;padding:4px 2px}
.more{color:var(--muted);font:600 14px var(--sans);padding:2px}
.legend{margin-top:auto;display:flex;gap:16px;font:500 14px var(--sans);color:var(--muted);flex-wrap:wrap}
.legend .id{font-size:13px}
#msg{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:600 28px var(--sans);color:var(--muted);background:#fff}
</style></head>
<body>
<div id="stage">
  <header><img src="/logo.png" alt="Lyons &amp; Hohl"><h1>Equipment on jobsites</h1><span class="ct" id="ct"></span>
    <div class="right"><div id="clock"></div><div id="upd"></div></div></header>
  <div class="body"><div class="sitewrap"><section id="sites"></section><div id="measure"></div></div>
    <aside><h3>Scheduled moves <b id="nOpen"></b></h3><div class="mvs" id="open"></div>
      <div class="legend"><span><span class="id down">ID</span> Down for maintenance</span><span><span class="id other">ID</span> Other status</span></div></aside></div>
</div>
<div id="msg">Loading equipment…</div>
<script>
const KEY = ${JSON.stringify(key)};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const md = (d) => { if (!d) return '—'; const [y, m, dd] = d.split('-'); return +m + '/' + +dd; };
const nice = (d) => { if (!d) return 'No date'; const t = new Date(d + 'T12:00:00'); return t.getFullYear() !== new Date().getFullYear() ? MON[t.getMonth()] + ' ' + t.getDate() + ', ' + t.getFullYear() : DAY[t.getDay()] + ' ' + MON[t.getMonth()] + ' ' + t.getDate(); };

function fitStage() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  $('#stage').style.transform = 'scale(' + s + ')';
}
addEventListener('resize', fitStage); fitStage();

function tick() { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
setInterval(tick, 15000); tick();

let last = null, lastOk = 0;
function render(d) {
  $('#ct').innerHTML = '<b>' + d.total + '</b> pieces · <b>' + d.sites.length + '</b> locations';
  cards = d.sites.map((s) => '<div class="site"><h2>' + esc(s.name) + '<span>' + s.count + '</span></h2>' +
    s.groups.map((g) => '<div class="grp' + (g.type === 'Buckets' ? ' bk' : '') + '"><span class="t">' + esc(g.type) + '</span><span class="ids">' +
      g.items.map((e) => '<span class="id ' + e.st + '">' + esc(e.id) + '</span>').join('') + '</span></div>').join('') + '</div>');
  fitSites();
  $('#nOpen').textContent = d.open.length || '';
  $('#open').innerHTML = d.open.length ? d.open.map((m) => '<div class="mv ' + (m.status === 'Need' ? 'need' : 'sched') + '"><span class="d">' + esc(nice(m.date)) + '</span><span class="e">' + esc(m.id) + '</span>' +
    '<span class="r">' + esc(m.from || '?') + '<span class="ar">→</span>' + esc(m.to || '?') + '</span>' +
    '<span class="w">' + (m.status === 'Need' ? '<b>Needs a move</b>' : 'Scheduled') + (m.driver ? ' · ' + esc(m.driver) : '') + '</span></div>').join('')
    : '<div class="none">No moves scheduled.</div>';
  trim($('#open'));
}
// Pack the jobsite cards into columns (each card goes in the shortest column),
// using the largest text size at which everything fits on the screen.
let cards = [];
function fitSites() {
  const box = $('#sites'), meas = $('#measure'), H = box.clientHeight, GAP = 14;
  let best = null;
  for (const cols of [4, 5, 6]) {
    const w = (box.clientWidth - (cols - 1) * 16) / cols;
    meas.style.width = w + 'px';
    for (let s = 1.3; s >= 0.6; s -= 0.03) {
      meas.style.setProperty('--s', s.toFixed(2));
      meas.innerHTML = cards.join('');
      const hs = [...meas.children].map((c) => c.offsetHeight);
      const col = Array.from({ length: cols }, () => ({ h: -GAP, items: [] }));
      hs.forEach((h, i) => { const c = col.reduce((a, b) => (b.h < a.h ? b : a)); c.h += h + GAP; c.items.push(i); });
      if (Math.max(...col.map((c) => c.h)) <= H) {
        // Prefer the layout that cuts off the fewest IDs, then the biggest text.
        const cut = [...meas.querySelectorAll('.id')].filter((x) => x.scrollWidth > x.clientWidth + 1).length;
        if (!best || cut < best.cut || (cut === best.cut && s > best.s + 0.001)) best = { s, col, cut };
        break;
      }
    }
  }
  meas.innerHTML = '';
  if (!best) best = { s: 0.6, col: [{ items: cards.map((_, i) => i) }] };
  box.style.setProperty('--s', best.s.toFixed(2));
  box.innerHTML = best.col.map((c) => '<div class="col">' + c.items.map((i) => cards[i]).join('') + '</div>').join('');
}
// Hide moves that don't fit, and say how many.
function trim(list) {
  const items = [...list.children]; items.forEach((x) => (x.hidden = false));
  let hidden = 0;
  while (list.scrollHeight > list.clientHeight + 1 && items.length - hidden > 1) { items[items.length - 1 - hidden].hidden = true; hidden++; }
  if (hidden) { const m = document.createElement('div'); m.className = 'more'; m.textContent = '+ ' + hidden + ' more'; list.appendChild(m);
    while (list.scrollHeight > list.clientHeight + 1 && items.length - hidden > 1) { items[items.length - 1 - hidden].hidden = true; hidden++; m.textContent = '+ ' + hidden + ' more'; } }
}
function showUpdated() {
  if (!last) return;
  const mins = Math.round((Date.now() - last.asOf) / 60000);
  const offline = Date.now() - lastOk > 10 * 60000;
  $('#upd').className = offline ? 'stale' : '';
  $('#upd').textContent = offline ? 'Can\\'t reach the server · showing data from ' + new Date(last.asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'Updated ' + (mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : new Date(last.asOf).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
}
async function load() {
  try {
    const r = await fetch('/api/tv?key=' + encodeURIComponent(KEY), { cache: 'no-store' });
    if (r.status === 202) { $('#msg').textContent = 'Getting the equipment list ready…'; return setTimeout(load, 8000); }
    if (!r.ok) { const b = await r.json().catch(() => ({})); if (!last) $('#msg').textContent = b.error || 'Can\\'t load the equipment list.'; return; }
    const d = await r.json(); lastOk = Date.now();
    if (!last || d.asOf !== last.asOf || d.today !== last.today) { last = d; render(d); }
    $('#msg').hidden = true;
  } catch (e) { if (!last) $('#msg').textContent = 'Can\\'t reach the server. Retrying…'; }
  showUpdated();
}
load(); setInterval(load, 60000); setInterval(showUpdated, 30000);
// Reload the whole page once a night, to pick up any changes to the screen itself.
setTimeout(() => location.reload(), (() => { const n = new Date(), t = new Date(n); t.setHours(3, 0, 0, 0); if (t <= n) t.setDate(t.getDate() + 1); return t - n; })());
</script>
</body></html>`;
