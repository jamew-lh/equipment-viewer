// The office TV screen: every jobsite and what's on it, plus scheduled and needed
// moves, laid out for one 1920 x 1080 screen. Opened by a NoviSign Embed widget
// at /tv?key=TV_KEY. No sign-in (a signage player can't type a PIN); the long
// key in the link is the password. It only reads.
import { OUT_OF_FLEET_LOCATIONS, OUT_OF_FLEET_STATUSES } from './config.mjs';

// Same order as the Jobsites screen.
const TYPE_ORDER = ['Excavator', 'Dozer', 'Articulating Truck', 'Roller', 'Rubber Tire Loader', 'Track Loader',
  'Skid Loader', 'Backhoe', 'Attachment', 'Trench Box', 'Shoring', 'Manhole Box', 'Stone Box'];
const rank = (t) => (t === 'Bucket' ? 1e4 : t === 'Type not set' ? 9e3 : TYPE_ORDER.includes(t) ? TYPE_ORDER.indexOf(t) : 1e3);
const SHORT = { 'Articulating Truck': 'Trucks', 'Rubber Tire Loader': 'Loaders', 'Track Loader': 'Track loaders', 'Skid Loader': 'Skid loaders',
  'Trench Box': 'Trench boxes', 'Manhole Box': 'Manhole boxes', 'Stone Box': 'Stone boxes', 'Steel Plate': 'Plates', 'Small Equipment': 'Small equip.',
  Excavator: 'Excavators', Dozer: 'Dozers', Roller: 'Rollers', Backhoe: 'Backhoes', Attachment: 'Attachments', Bucket: 'Buckets',
  Tractor: 'Tractors', Slinger: 'Slingers', Sweeper: 'Sweepers', Scraper: 'Scrapers', Zipper: 'Zippers', Shoring: 'Shoring' };
const nyDate = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(t);

export function buildTv(snap, now) {
  // Only machines with TRACKING ticked in Airtable.
  const live = snap.eq.filter((e) => e.tk !== false && !e.old
    && !OUT_OF_FLEET_LOCATIONS.includes(e.loc) && !OUT_OF_FLEET_STATUSES.includes(e.st));
  const bySite = new Map();
  for (const e of live) { const s = e.loc || 'No location set'; if (!bySite.has(s)) bySite.set(s, []); bySite.get(s).push(e); }
  const sites = [...bySite].map(([name, list]) => {
    const g = new Map();
    for (const e of list) { const t = e.ty || 'Type not set'; if (!g.has(t)) g.set(t, []); g.get(t).push(e); }
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
  return { asOf: snap.asOf, now, total: live.length, sites, open, today };
}

export const tvPage = (key) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>LH Equipment · Office screen</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..800&family=JetBrains+Mono:wght@500;700&family=Creepster&display=swap">
<style>
/* One fixed 1920x1080 stage, scaled to whatever screen shows it. */
:root{--green:#004745;--tan:#D4A070;--tan-soft:#f6ebdd;--ink:#1e2a2a;--muted:#56635f;--line:#d3dbd8;--field:#f4f7f6;--down:#a5401b;--down-soft:#fbe6dc;--s:1;
  --sans:"Archivo",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;color-scheme:light}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;height:100%;background:#fff;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;font-family:var(--sans);color:var(--ink)}
#stage{width:1920px;height:1080px;flex:none;transform-origin:center center;display:grid;grid-template-rows:96px 1fr;background:#fff;position:relative;overflow:hidden}
header{display:flex;align-items:center;gap:28px;padding:0 36px;border-bottom:5px solid var(--tan)}
header img{height:62px}
header h1{margin:0;font:800 34px var(--sans);font-stretch:118%;color:var(--green);letter-spacing:.01em}
.hw,#deco{display:none}
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
/* One grid per card: the label column is as wide as that card's widest label,
   so labels never run into the IDs, whatever font the player uses. */
.rows{display:grid;grid-template-columns:auto minmax(0,1fr)}
.grp{display:contents}
.grp > *{border-top:1px solid var(--line);padding-block:calc(5px*var(--s))}
.grp:first-child > *{border-top:none}
.grp .t{font:700 calc(12px*var(--s)) var(--sans);font-stretch:112%;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);padding:calc(8px*var(--s)) 10px calc(5px*var(--s)) 10px;line-height:1.15}
.ids{display:flex;flex-wrap:wrap;align-content:flex-start;gap:calc(3px*var(--s)) calc(5px*var(--s));padding-right:10px;min-width:0}
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

/* ===== Halloween look. Turned on by the date (see THEMES in the script) or by
   &theme=halloween in the link. Everything below only applies with that class,
   so the normal look is untouched. ===== */
body.th-halloween{--ink:#f4ede4;--muted:#b9abc8;--line:#3b3048;--field:#2b2237;--green:#5b2a8a;--tan:#ff7b1c;--tan-soft:#5a3c12;--down:#e5392a;background:#110d16}
.th-halloween #stage{background:#15111b}
.th-halloween header{background:#1c1624;border-bottom:none;position:relative;z-index:2}
.th-halloween header::after{content:"";position:absolute;left:0;right:0;bottom:-10px;height:10px;background:repeating-linear-gradient(-45deg,#ff7b1c 0 22px,#141014 22px 44px)}
.th-halloween header img{background:#fff;border-radius:10px;padding:5px 10px;height:58px}
.th-halloween .nm,.th-halloween header h1 .nm{display:none}
.th-halloween .hw{display:inline}
.th-halloween header h1{font:400 50px "Creepster","Archivo",system-ui,sans-serif;letter-spacing:.04em;color:#ff7b1c;text-shadow:0 0 18px rgba(255,123,28,.45)}
.th-halloween .sitewrap{padding-top:28px}
.th-halloween .site{background:#211a2a;border-color:#3b3048;position:relative;z-index:1}
.th-halloween .site h2{background:linear-gradient(90deg,#4f2278,#6a2f9e)}
.th-halloween .site h2 span{color:#ffa04d}
.th-halloween .id{color:#f4ede4}
.th-halloween .id.other{color:#ffd9a8}
.th-halloween aside{background:#1a1521;border-left-color:#3b3048;position:relative}
.th-halloween aside h3{color:#ff8a33;padding-top:8px}
.th-halloween aside h3 b{color:#f4ede4}
.th-halloween .mv{background:#241c2e;border-color:#3b3048;position:relative;z-index:1}
.th-halloween .mv .w b{color:#ff6a55}
.th-halloween #msg{background:#15111b;color:#b9abc8}
.th-halloween #deco{display:block;position:absolute;inset:0;pointer-events:none;z-index:3}
/* bats fly slowly across the header, flapping */
.bat{position:absolute;left:-90px;fill:#0b080e;filter:drop-shadow(0 0 2px rgba(255,123,28,.55));animation:fly linear infinite}
.bat svg{display:block;animation:flap .32s ease-in-out infinite alternate;transform-origin:50% 40%}
.bat.b1{top:14px;width:58px;animation-duration:46s}
.bat.b2{top:52px;width:38px;animation-duration:61s;animation-delay:-22s}
.bat.b3{top:30px;width:46px;animation-duration:73s;animation-delay:-48s}
@keyframes fly{0%{transform:translate(0,0)}25%{transform:translate(520px,14px)}50%{transform:translate(1040px,-6px)}75%{transform:translate(1560px,12px)}100%{transform:translate(2100px,0)}}
@keyframes flap{from{transform:scaleY(1)}to{transform:scaleY(.45)}}
/* jack-o'-lantern by the clock; its face flickers */
.pumpkin{position:absolute;top:12px;right:250px;width:74px}
.pumpkin .face{fill:#ffd35c;animation:flicker 3.2s infinite}
@keyframes flicker{0%,100%{opacity:1}42%{opacity:.75}45%{opacity:1}70%{opacity:.85}}
/* cobweb in the bottom corner of the moves panel, behind the move cards */
.web,.spider{display:none}
.th-halloween .web{display:block;position:absolute;right:0;bottom:0;width:190px;opacity:.4;stroke:#cfc3dc;fill:none;stroke-width:1.4;z-index:0;pointer-events:none}
.th-halloween .spider{display:block;position:absolute;right:62px;bottom:120px;width:22px;z-index:0;pointer-events:none;animation:drop 9s ease-in-out infinite}
.th-halloween aside > *:not(.web):not(.spider){position:relative;z-index:1}
.spider line{stroke:#cfc3dc;stroke-width:1}
@keyframes drop{0%,100%{transform:translateY(0)}50%{transform:translateY(46px)}}
/* low fog drifting along the bottom, behind the cards */
.fog{position:absolute;left:-10%;right:-10%;bottom:-40px;height:190px;z-index:0;opacity:.5;
  background:radial-gradient(40% 60% at 20% 70%,rgba(185,171,200,.35),transparent 70%),radial-gradient(35% 55% at 55% 80%,rgba(185,171,200,.28),transparent 70%),radial-gradient(40% 60% at 85% 70%,rgba(185,171,200,.32),transparent 70%);
  animation:fog 38s ease-in-out infinite alternate}
@keyframes fog{from{transform:translateX(-4%)}to{transform:translateX(4%)}}
@media (prefers-reduced-motion:reduce){.bat,.bat svg,.pumpkin .face,.spider,.fog{animation:none}.bat{display:none}}
</style></head>
<body>
<div id="stage">
  <header><img src="/logo.png" alt="Lyons &amp; Hohl"><h1><span class="nm">Equipment on jobsites</span><span class="hw">Spooky Jobsites</span></h1><span class="ct" id="ct"></span>
    <div class="right"><div id="clock"></div><div id="upd"></div></div></header>
  <div id="deco" aria-hidden="true">
    <div class="bat b1"><svg viewBox="0 0 48 20"><path d="M0 10C6 4 12 4 16 8C18 4 20 2 22 4L24 0L26 4C28 2 30 4 32 8C36 4 42 4 48 10C42 9 38 12 36 16C33 13 29 14 27 18L24 15L21 18C19 14 15 13 12 16C10 12 6 9 0 10Z"/></svg></div>
    <div class="bat b2"><svg viewBox="0 0 48 20"><path d="M0 10C6 4 12 4 16 8C18 4 20 2 22 4L24 0L26 4C28 2 30 4 32 8C36 4 42 4 48 10C42 9 38 12 36 16C33 13 29 14 27 18L24 15L21 18C19 14 15 13 12 16C10 12 6 9 0 10Z"/></svg></div>
    <div class="bat b3"><svg viewBox="0 0 48 20"><path d="M0 10C6 4 12 4 16 8C18 4 20 2 22 4L24 0L26 4C28 2 30 4 32 8C36 4 42 4 48 10C42 9 38 12 36 16C33 13 29 14 27 18L24 15L21 18C19 14 15 13 12 16C10 12 6 9 0 10Z"/></svg></div>
    <svg class="pumpkin" viewBox="0 0 80 72"><path d="M40 14c-2-8 2-12 8-13l1 3c-4 1-6 4-5 10z" fill="#3f7a2c"/>
      <ellipse cx="22" cy="42" rx="18" ry="26" fill="#e8650f"/><ellipse cx="58" cy="42" rx="18" ry="26" fill="#e8650f"/><ellipse cx="40" cy="42" rx="20" ry="28" fill="#ff7b1c"/>
      <g class="face"><path d="M22 34l8-9 6 11zM58 34l-8-9-6 11zM36 44l4-6 4 6zM20 52c6 8 34 8 40 0l-4 2-3 4-4-3-5 4-4-4-5 4-4-4-3 3-4-4z"/></g></svg>
    <div class="fog"></div>
  </div>
  <div class="body"><div class="sitewrap"><section id="sites"></section><div id="measure"></div></div>
    <aside><h3>Scheduled moves <b id="nOpen"></b></h3><div class="mvs" id="open"></div>
<svg class="web" aria-hidden="true" viewBox="0 0 170 170"><path d="M170 170L20 170M170 170L60 60M170 170L170 20M170 170L110 20M170 170L0 110"/>
      <path d="M140 170Q150 152 170 144M110 170Q128 132 170 118M80 170Q104 112 170 90M50 170Q78 88 170 60"/>
      <path d="M150 150Q160 156 170 157M128 128Q146 130 152 140M104 104Q128 104 138 120"/></svg>
      <svg class="spider" aria-hidden="true" viewBox="0 0 22 60"><line x1="11" y1="0" x2="11" y2="40"/><ellipse cx="11" cy="46" rx="5" ry="6" fill="#0b080e" stroke="#cfc3dc" stroke-width=".8"/>
      <path d="M6 44l-5-4M6 47l-6 0M6 50l-5 4M16 44l5-4M16 47l6 0M16 50l5 4" stroke="#cfc3dc" stroke-width="1"/></svg>
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
// Times are always shown in Eastern time, using the server's clock, whatever
// time zone or clock the signage player itself is set to.
const TZ = 'America/New_York';
let skew = 0; // server time minus this player's time
const nowMs = () => Date.now() + skew;
const hm = (t) => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const mdhm = (t) => new Date(t).toLocaleString('en-US', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const nyYear = () => +new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric' }).format(nowMs());
const nice = (d) => { if (!d) return 'No date'; const t = new Date(d + 'T12:00:00'); return t.getFullYear() !== nyYear() ? MON[t.getMonth()] + ' ' + t.getDate() + ', ' + t.getFullYear() : DAY[t.getDay()] + ' ' + MON[t.getMonth()] + ' ' + t.getDate(); };

function fitStage() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  $('#stage').style.transform = 'scale(' + s + ')';
}
addEventListener('resize', fitStage); fitStage();

function tick() { $('#clock').textContent = hm(nowMs()); }
setInterval(tick, 15000); tick();

let last = null, lastOk = 0;
function render(d) {
  $('#ct').innerHTML = '<b>' + d.total + '</b> pieces · <b>' + d.sites.length + '</b> locations';
  cards = d.sites.map((s) => '<div class="site"><h2>' + esc(s.name) + '<span>' + s.count + '</span></h2><div class="rows">' +
    s.groups.map((g) => '<div class="grp' + (g.type === 'Buckets' ? ' bk' : '') + '"><span class="t">' + esc(g.type) + '</span><span class="ids">' +
      g.items.map((e) => '<span class="id ' + e.st + '">' + esc(e.id) + '</span>').join('') + '</span></div>').join('') + '</div></div>');
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
  const mins = Math.round((nowMs() - last.asOf) / 60000);
  const offline = Date.now() - lastOk > 10 * 60000;
  $('#upd').className = offline ? 'stale' : '';
  $('#upd').textContent = offline ? 'Can\\'t reach the server · showing data from ' + hm(last.asOf)
    : 'Updated ' + (mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : mdhm(last.asOf));
}
async function load() {
  try {
    const r = await fetch('/api/tv?key=' + encodeURIComponent(KEY), { cache: 'no-store' });
    if (r.status === 202) { $('#msg').textContent = 'Getting the equipment list ready…'; return setTimeout(load, 8000); }
    if (!r.ok) { const b = await r.json().catch(() => ({})); if (!last) $('#msg').textContent = b.error || 'Can\\'t load the equipment list.'; return; }
    const d = await r.json(); lastOk = Date.now();
    if (d.now) { skew = d.now - Date.now(); tick(); applyTheme(); }
    if (!last || d.asOf !== last.asOf || d.today !== last.today) { last = d; render(d); }
    $('#msg').hidden = true;
  } catch (e) { if (!last) $('#msg').textContent = 'Can\\'t reach the server. Retrying…'; }
  showUpdated();
}
// ----- seasonal looks -----
// Each look runs between two dates (month-day, Eastern). Add a line here for another
// holiday. The link can force one: &theme=halloween, or &theme=normal to turn them off.
const THEMES = [{ name: 'halloween', from: '10-20', to: '10-31' }];
const forced = ((new URLSearchParams(location.search).get('theme') || '').toLowerCase().replace('auto', ''));
function applyTheme() {
  const md = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: '2-digit', day: '2-digit' }).format(nowMs()).replace('/', '-');
  const pick = forced === 'normal' ? null : THEMES.find((t) => t.name === forced) || (forced ? null : THEMES.find((t) => md >= t.from && md <= t.to));
  for (const t of THEMES) document.body.classList.toggle('th-' + t.name, pick === t);
}
applyTheme(); setInterval(applyTheme, 60000);

load(); setInterval(load, 60000); setInterval(showUpdated, 30000);
// Reload the whole page once a night, to pick up any changes to the screen itself.
// (3 AM Eastern, checked every 10 minutes so a wrong player clock can't break it)
const bootedAt = Date.now();
setInterval(() => {
  const h = +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(nowMs());
  if (h === 3 && Date.now() - bootedAt > 2 * 3600e3) location.reload();
}, 10 * 60e3);
</script>
</body></html>`;
