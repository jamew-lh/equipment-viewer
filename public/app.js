let D, EQ, MV, byEq;
const RETIRED_LOC = new Set(['Auction','Scrap','HB Shop - TRASH','Trade In']);
const RETIRED_ST = new Set(['Sold/Trade']);
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const main = $('#main');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = d => { if(!d) return '—'; const [y,m,dd] = d.split('-'); return `${MON[+m-1]} ${+dd}, ${y}`; };
const fmtS = d => { if(!d) return '—'; const [y,m,dd] = d.split('-'); return `${+m}/${+dd}/${y.slice(2)}`; };
const today = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
const daysSince = d => Math.round((today() - Date.parse(d)) / 864e5);

function prepare(data){
D = data; EQ = D.eq; MV = D.mv; D.log ??= [];
// moves per machine, newest first (MV is already sorted newest first)
byEq = EQ.map(() => []);
MV.forEach((m, i) => { if (m[2] >= 0) byEq[m[2]].push(i); });
EQ.forEach((e, i) => {
  e.i = i; e.retired = !!e.old || RETIRED_LOC.has(e.loc) || RETIRED_ST.has(e.st);
  // Only machines with TRACKING ticked in Airtable show in the app. (Old Equipment has no
  // TRACKING box; it shows under "Include sold, scrapped and old" when it has a Type.)
  // Moves for hidden machines stay in the Moves log as plain text.
  // (A machine with no TRACKING value at all, from a copy made before the box existed, counts as tracked.)
  e.hidden = e.old ? !e.ty : e.tk === false;
  const last = byEq[i].find(j => MV[j][8] !== 'Need' && MV[j][8] !== 'Scheduled');
  e.lastMove = last != null ? MV[last] : null;
  // arrived at current location: newest completed move whose To matches Location
  const arr = byEq[i].find(j => MV[j][4] && MV[j][4].toLowerCase() === (e.loc||'').toLowerCase());
  e.arrived = arr != null ? MV[arr][0] : '';
});
}

function statusPill(st){
  if(!st) return '<span class="pill p-mute">No status</span>';
  const c = st==='In Service'?'p-ok':st==='Down for Maintenance'?'p-warn':st==='Sold/Trade'||st==='Out of Service'?'p-mute':'p-amber';
  return `<span class="pill ${c}">${esc(st)}</span>`;
}
function eqRow(e, opts={}){
  const mm = [e.mk, e.md].filter(Boolean).join(' ') || '<span class="muted">No make/model</span>';
  const sub = opts.showLoc ? (e.loc || 'No location') : (e.ty || '');
  const right = opts.showSince && e.arrived ? `<small>here since ${fmtS(e.arrived)}</small>` : (opts.showLoc ? `<small>${esc(e.ty||'')}</small>` : '');
  return `<button class="eq" data-eq="${e.i}"><span class="id">${esc(e.id)}</span>
    <span class="mm">${e.mk||e.md?esc(mm):mm}<small>${esc(sub)}${e.yr?` · ${esc(e.yr)}`:''}</small></span>
    <span class="rt">${statusPill(e.st)}${right}</span></button>`;
}

// ---------------- navigation ----------------
let tab = 'sites', stack = [];
// Order types are listed in on Jobsites. Types not named here go after the
// boxes, in A-Z order, with buckets last.
const TYPE_ORDER = ['Excavator','Dozer','Articulating Truck','Roller',
  'Rubber Tire Loader','Track Loader','Skid Loader','Backhoe','Attachment',
  'Trench Box','Shoring','Manhole Box','Stone Box'];
const typeRank = t => { if (t === 'Bucket') return 1e4; if (t === 'Type not set') return 9e3; const i = TYPE_ORDER.indexOf(t); return i < 0 ? 1e3 : i; };
const byTypeOrder = (a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b);
const state = { site:null, q:'', type:'', showRetired:false, mq:'', myear:'', mOnlyUnmatched:false, mShown:100 };
function setTab(t){ tab=t; stack=[]; for(const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', b.id==='t-'+t); render(); window.scrollTo(0,0); }
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { state.site=null; setTab(b.id.slice(2)); });
function openEq(i){ stack.push({tab, site:state.site, y:window.scrollY}); renderMachine(EQ[i]); window.scrollTo(0,0); }
function goBack(){ const s = stack.pop(); if(!s) return render(); tab=s.tab; state.site=s.site; render(); window.scrollTo(0,s.y); }
main.addEventListener('click', ev => {
  const b = ev.target.closest('[data-eq]'); if (b) return openEq(+b.dataset.eq);
  const s = ev.target.closest('[data-site]'); if (s) { state.site = s.dataset.site; stack=[]; tab='sites'; for(const x of document.querySelectorAll('.tabs button')) x.setAttribute('aria-selected', x.id==='t-sites'); render(); window.scrollTo(0,0); }
});
function render(){ ({sites:renderSites, fleet:renderFleet, moves:renderMoves})[tab](); }
const banner = window.SAMPLE_BANNER || '';

// ---------------- jobsites ----------------
function renderSites(){
  if (state.site) return renderSite(state.site);
  const live = EQ.filter(e => !e.retired && !e.hidden);
  const groups = {};
  live.forEach(e => (groups[e.loc || 'No location set'] ??= []).push(e));
  const names = Object.keys(groups).sort((a,b) => groups[b].length - groups[a].length || a.localeCompare(b));
  const card = n => {
    const g = groups[n];
    const tc = {}; g.forEach(e => { if(e.ty) tc[e.ty]=(tc[e.ty]||0)+1; });
    const types = Object.entries(tc).sort((a,b)=>byTypeOrder(a[0],b[0])).slice(0,4).map(([t,n])=>`${n} ${t}`).join(' · ');
    const down = g.filter(e => e.st==='Down for Maintenance').length;
    return `<button class="site" data-site="${esc(n)}"><div class="row"><span class="nm">${esc(n)}</span><span class="ct">${g.length}</span></div>
      <span class="types">${esc(types)}</span>${down?`<span class="pill p-warn" style="align-self:flex-start">${down} down for maintenance</span>`:''}</button>`;
  };
  const retired = EQ.filter(e => e.retired).length;
  main.innerHTML = `<div class="view stack">${banner}
    <div><h1>Jobsites</h1><p class="lede">${live.length} pieces across ${names.length} locations. Tap a site to see what's there.</p></div>
    <div class="sites">${names.map(card).join('')}</div>
    <p class="sub">${retired} sold, scrapped or auctioned pieces are left off this page. Find them under Fleet.</p></div>`;
}
function renderSite(n){
  const g = EQ.filter(e => !e.retired && !e.hidden && (e.loc || 'No location set') === n);
  const byType = {}; g.forEach(e => (byType[e.ty || 'Type not set'] ??= []).push(e));
  const types = Object.keys(byType).sort(byTypeOrder);
  const recent = MV.filter(m => m[3]===n || m[4]===n).slice(0, 8);
  main.innerHTML = `<div class="view stack">
    <button class="back" id="back">← All jobsites</button>
    <div><h1>${esc(n)}</h1><p class="lede">${g.length} pieces here now, by Location in Airtable</p></div>
    <div class="cols">
      <div class="list">${types.map(t => `<div class="grp"><span>${esc(t)}</span><span>${byType[t].length}</span></div>` +
        byType[t].sort((a,b)=>a.id.localeCompare(b.id, undefined, {numeric:true})).map(e => eqRow(e, {showSince:true})).join('')).join('')}</div>
      <div class="panel"><h2>Recent moves in and out</h2>${recent.length ? `<div class="tl">${recent.map(m => moveLine(m, true)).join('')}</div>` : '<p class="sub">No moves logged for this site.</p>'}</div>
    </div></div>`;
  $('#back').onclick = () => { state.site=null; render(); };
}
function moveLine(m, showEq){
  const eq = m[2] >= 0 && !EQ[m[2]].hidden ? EQ[m[2]] : null;
  const who = showEq ? (eq ? `<button class="lnk mono" data-eq="${eq.i}" style="appearance:none;border:none;background:none;padding:0;font:600 14px var(--f-mono);color:var(--ink);text-decoration:underline;cursor:pointer">${esc(eq.id)}</button> ` : `<span class="mono">${esc(m[1]||'?')}</span> `) : '';
  const meta = [m[5]&&`Driver ${esc(m[5])}`, m[6]&&`Truck ${esc(m[6])}`, m[7]&&m[7]!=='n/a'&&`Permit ${esc(m[7])}`, m[8]&&m[8]!=='Complete'&&`<b class="open">${esc(m[8])}</b>`, m[12]&&`Entered by ${esc(m[12])}`].filter(Boolean);
  const k = isOffice() && m[11] ? MV.indexOf(m) : -1;
  const done = k < 0 ? '' : `${isOpen(m) ? `<button type="button" class="mini" data-done="${k}">Mark done</button>` : ''}<button type="button" class="mini ghost" data-edit-move="${k}">Edit</button>`;
  return `<div class="mv"><span class="d">${fmtS(m[0])}</span>
    <span class="ft">${who}<span title="${esc(m[9]||'')}">${esc(m[3]||'?')}</span><span class="ar">→</span><span title="${esc(m[10]||'')}">${esc(m[4]||'?')}</span></span>
    ${meta.length||done?`<span class="meta">${meta.map(x=>`<span>${x}</span>`).join('')}${done}</span>`:''}</div>`;
}

// ---------------- fleet ----------------
function renderFleet(){
  main.innerHTML = `<div class="view stack">${banner}
    <div class="head-row"><div><h1>Fleet</h1><p class="lede">Every machine and attachment. Pick a type, or search by ID, make, model or serial.</p></div>
      ${isOffice() ? '<button type="button" class="btn small" id="addMachine">+ Add machine</button>' : ''}</div>
    <div class="controls">
      <input type="search" id="q" placeholder="Search, e.g. 336, D6, Valley Creek" value="${esc(state.q)}" aria-label="Search equipment">
      <label class="toggle"><input type="checkbox" id="ret" ${state.showRetired?'checked':''}> Include sold, scrapped and old equipment</label>
    </div>
    <div class="chips" id="cats" aria-label="Filter by type"></div>
    <div id="out"></div></div>`;
  const draw = () => {
    const q = state.q.trim().toLowerCase();
    let rows = EQ.filter(e => !e.hidden && (state.showRetired || !e.retired) &&
      (!q || [e.id,e.mk,e.md,e.sn,e.loc,e.ty].join(' ').toLowerCase().includes(q)));
    const counts = {}; rows.forEach(e => { const t = e.ty || 'Type not set'; counts[t] = (counts[t]||0) + 1; });
    const types = Object.keys(counts).sort((a,b) => (a==='Type not set')-(b==='Type not set') || counts[b]-counts[a] || a.localeCompare(b));
    if (state.type && !counts[state.type]) types.push(state.type);
    $('#cats').innerHTML = [['', 'All', rows.length], ...types.map(t => [t, t, counts[t]||0])]
      .map(([v,l,n]) => `<button class="chip" data-c="${esc(v)}" aria-pressed="${state.type===v}">${esc(l)}<b>${n}</b></button>`).join('');
    if (state.type) rows = rows.filter(e => (e.ty || 'Type not set') === state.type);
    rows.sort((a,b) => (a.retired-b.retired) || (a.ty||'~').localeCompare(b.ty||'~') || a.id.localeCompare(b.id, undefined, {numeric:true}));
    $('#out').innerHTML = rows.length ? `<p class="sub" style="margin:0 0 8px">${rows.length} shown</p><div class="list">${rows.map(e => eqRow(e,{showLoc:true})).join('')}</div>` : '<div class="panel empty">Nothing matches. Try fewer letters or clear the type filter.</div>';
  };
  $('#q').oninput = e => { state.q = e.target.value; draw(); };
  if ($('#addMachine')) $('#addMachine').onclick = () => editMachine(null);
  $('#ret').onchange = e => { state.showRetired = e.target.checked; draw(); };
  $('#cats').onclick = e => { const b = e.target.closest('[data-c]'); if(b){ state.type = b.dataset.c; draw(); } };
  draw();
}

// ---------------- machine ----------------
function renderMachine(e){
  const mm = [e.mk, e.md].filter(Boolean).join(' ');
  const facts = [['Type', e.ty], ['Make', e.mk], ['Model', e.md], ['Year', e.yr],
    ['Serial number', e.sn && `<span class="mono">${esc(e.sn)}</span>`], ['Operating weight', e.wt && (isNaN(+String(e.wt).replace(/,/g,'')) ? esc(e.wt) : `${Number(String(e.wt).replace(/,/g,'')).toLocaleString()} lb`)],
    ['Dealer', (e.dl||[]).join(', ')], ['Filter list', e.flt && `<span class="mono">${esc(e.flt)}</span>`], ['Tooth type', e.tooth]].filter(f => f[1]);
  const moves = byEq[e.i].map(j => MV[j]);
  const lm = e.lastMove;
  const mismatch = lm && !e.retired && e.loc && lm[4] && lm[4].toLowerCase() !== e.loc.toLowerCase();
  let tl = '', yr = '';
  moves.forEach((m, k) => { const y = (m[0]||'????').slice(0,4); if (y !== yr) { tl += `<div class="yr">${y==='????'?'No date':y}</div>`; yr = y; } tl += moveLine(m, false).replace('class="mv"', k===0?'class="mv cur"':'class="mv"'); });
  const photos = e.f.filter(f=>f[2]==='photo').length, docs = e.f.length - photos;
  main.innerHTML = `<div class="view stack">
    <button class="back" id="back">← Back</button>
    <section class="band">
      <div><div class="k">Equipment</div><div class="eqid">${esc(e.id)}</div><div class="mm">${esc(mm || 'Make and model not set')}${e.yr?` · ${esc(e.yr)}`:''}</div></div>
      <div class="rt"><div class="k">Location now</div><div class="loc">${esc(e.loc || 'Not set')}</div>
        ${e.arrived ? `<div class="since">Here since ${fmt(e.arrived)} · ${daysSince(e.arrived)} days</div>` : ''}${statusPill(e.st)}</div>
      ${isOffice() && !e.old ? `<div class="acts"><button type="button" class="btn band-btn" id="mvHere">Add move</button><button type="button" class="btn band-btn ghost" id="editHere">Edit details</button></div>` : ''}
    </section>
    ${mismatch ? `<div class="flag">The moves log last shows this going to <b>${esc(lm[4])}</b> on ${fmt(lm[0])}. Location says <b>${esc(e.loc)}</b>, which the app treats as correct. A move may have been missed.</div>` : ''}
    ${e.old ? `<div class="flag">This machine is in the Old Equipment table.</div>` : ''}
    <div class="cols">
      <div class="stack">
        <div class="panel"><h2>Details</h2>${facts.length ? `<dl class="facts">${facts.map(([k,v]) => `<dt>${k}</dt><dd>${typeof v==='string'&&!v.startsWith('<')?esc(v):v}</dd>`).join('')}</dl>` : '<p class="sub">No details entered yet.</p>'}</div>
        ${e.nt ? `<div class="panel"><h2>Notes</h2><div class="notes">${esc(e.nt)}</div></div>` : ''}
        <div class="panel"><h2>Photos &amp; spec sheets <small>${e.f.length ? `${photos} photo${photos===1?'':'s'}, ${docs} file${docs===1?'':'s'}` : ''}</small></h2>
          ${isOffice() && !e.old ? `<label class="btn small secondary filebtn">+ Add photo or file<input type="file" id="addFiles" accept="image/*,application/pdf" multiple></label>` : ''}
          ${e.f.length ? `${photos ? `<div class="gallery">${e.f.filter(f=>f[2]==='photo').map(f => photoTile(e,f)).join('')}</div>` : ''}
            ${docs ? `<div class="files">${e.f.filter(f=>f[2]!=='photo').map(f => `<a class="file" href="${f[3] || fileUrl(e,f)}" target="_blank" rel="noopener"><i>${f[2]==='pdf'?'PDF':'FILE'}</i><span>${esc(f[1])}</span></a>`).join('')}</div>` : ''}` : '<p class="sub">None attached.</p>'}</div>
        ${changePanel(e)}
      </div>
      <div class="panel"><h2>Move history <small>${moves.length} move${moves.length===1?'':'s'}</small></h2>
        ${moves.length ? `<div class="tl">${tl}</div>` : '<p class="sub">No moves logged under this ID.</p>'}</div>
    </div></div>`;
  $('#back').onclick = goBack;
  if ($('#mvHere')) { $('#mvHere').onclick = () => moveForm({ eq: e }); $('#editHere').onclick = () => editMachine(e); }
  if ($('#addFiles')) $('#addFiles').onchange = ev => addFiles(e, ev.target.files);
}

// ---------------- moves ----------------
function renderMoves(){
  const years = [...new Set(MV.map(m => (m[0]||'').slice(0,4)).filter(Boolean))].sort().reverse();
  const unmatched = MV.filter(m => m[2] < 0).length;
  const open = MV.filter(m => m[8]==='Need' || m[8]==='Scheduled');
  main.innerHTML = `<div class="view stack">${banner}
    <div class="head-row"><div><h1>Moves</h1><p class="lede">All ${MV.length.toLocaleString()} moves since 2019, newest first.</p></div>
      ${isOffice() ? '<button type="button" class="btn small" id="addMoveTop">+ Add move</button>' : ''}</div>
    <div class="stats">
      <div class="stat"><b>${MV.filter(m=>daysSince(m[0])<=7&&daysSince(m[0])>=0).length}</b><span>moves in the last 7 days</span></div>
      <div class="stat"><b>${MV.filter(m=>m[0]>='2026-01-01').length.toLocaleString()}</b><span>moves in 2026</span></div>
      <div class="stat"><b>${open.length}</b><span>scheduled or needed</span></div>
      <div class="stat"><b>${(D.stats.matched/MV.length*100).toFixed(0)}%</b><span>matched to a machine</span></div>
    </div>
    <div class="controls">
      <input type="search" id="mq" placeholder="Search machine, site or driver" value="${esc(state.mq)}" aria-label="Search moves">
      <select id="yr" aria-label="Year"><option value="">All years</option>${years.map(y=>`<option ${y===state.myear?'selected':''}>${y}</option>`).join('')}</select>
    </div>
    ${open.length ? `<div class="panel"><h2>Scheduled and needed <small>${open.length}</small></h2><div class="tl">${open.map(m => moveLine(m, true)).join('')}</div></div>` : ''}
    <label class="toggle"><input type="checkbox" id="um" ${state.mOnlyUnmatched?'checked':''}> Only moves that couldn't be matched to a machine (${unmatched})</label>
    <div id="mout" class="stack"></div></div>`;
  const draw = () => {
    const q = state.mq.trim().toLowerCase();
    const rows = MV.filter(m => (!state.myear || (m[0]||'').startsWith(state.myear)) && (!state.mOnlyUnmatched || m[2] < 0) &&
      (!q || [m[1], m[2]>=0?EQ[m[2]].id:'', m[3], m[4], m[5], m[9], m[10]].join(' ').toLowerCase().includes(q)));
    const shown = rows.slice(0, state.mShown);
    $('#mout').innerHTML = rows.length ? `<p class="sub" style="margin:0">${rows.length.toLocaleString()} move${rows.length===1?'':'s'}${rows.length>shown.length?`, showing the newest ${shown.length}`:''}</p>
      <div class="tbl"><table><thead><tr><th>Date</th><th>Equipment</th><th>From</th><th>To</th><th class="hide-sm">Driver</th><th class="hide-sm">Truck</th><th class="hide-sm">Permit</th>${isOffice() ? '<th></th>' : ''}</tr></thead><tbody>
      ${shown.map(m => `<tr class="${m[8]==='Need'||m[8]==='Scheduled'?'need':''}"><td class="d">${fmtS(m[0])}</td>
        <td>${m[2]<0?`<span class="raw">${esc(m[1]||'—')}</span> <span class="pill p-amber">Not matched</span>`:EQ[m[2]].hidden?`<span class="raw">${esc(EQ[m[2]].id)}</span>`:`<button class="lnk" data-eq="${m[2]}">${esc(EQ[m[2]].id)}</button>`}</td>
        <td title="${esc(m[9])}">${esc(m[3]||'—')}</td><td title="${esc(m[10])}">${esc(m[4]||'—')}</td>
        <td class="hide-sm">${esc(m[5]||'—')}</td><td class="hide-sm mono">${esc(m[6]||'—')}</td><td class="hide-sm mono">${esc(m[7]&&m[7]!=='n/a'?m[7]:'—')}</td>${isOffice() ? `<td class="act">${m[11] ? `<button type="button" class="mini ghost" data-edit-move="${MV.indexOf(m)}">Edit</button>` : ''}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>${rows.length>shown.length?'<button class="more" id="more">Show 100 more</button>':''}` : '<div class="panel empty">No moves match.</div>';
    const more = $('#more'); if (more) more.onclick = () => { state.mShown += 100; draw(); };
  };
  if ($('#addMoveTop')) $('#addMoveTop').onclick = () => moveForm({});
  $('#mq').oninput = e => { state.mq = e.target.value; state.mShown = 100; draw(); };
  $('#yr').onchange = e => { state.myear = e.target.value; state.mShown = 100; draw(); };
  $('#um').onchange = e => { state.mOnlyUnmatched = e.target.checked; state.mShown = 100; draw(); };
  draw();
}


// ---------------- live app: sign-in, loading, refresh ----------------
const fileUrl = (e, f) => `/api/file?r=${encodeURIComponent(e.rec)}&a=${encodeURIComponent(f[0])}`;
const lb = $('#lightbox');
main.addEventListener('click', ev => {
  const p = ev.target.closest('[data-photo]'); if (!p) return;
  $('#lbImg').src = p.dataset.photo; $('#lbOpen').href = p.dataset.photo; lb.hidden = false; $('#lbClose').focus();
});
$('#lbClose').onclick = () => { lb.hidden = true; $('#lbImg').removeAttribute('src'); };
lb.onclick = ev => { if (ev.target === lb) $('#lbClose').onclick(); };
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !lb.hidden) $('#lbClose').onclick(); });

const ago = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m/60)} hr ago` : fmt(new Date(t).toISOString().slice(0,10)); };
function showUpdated(){
  const u = $('#updated');
  if (!D) { u.innerHTML = ''; return; }
  u.innerHTML = `<span id="upd">Updated ${ago(D.asOf)}</span>${isOffice() ? `<span class="who">Office · ${esc(D.office.name)}</span>` : ''}<button type="button" id="refresh">Refresh</button><button type="button" id="signout">Sign out</button>`;
  $('#refresh').onclick = refreshNow;
  $('#signout').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); D = null; $('#fab').hidden = true; showUpdated(); showPin(); };
}
setInterval(() => { if (D && $('#upd')) $('#upd').textContent = `Updated ${ago(D.asOf)}`; }, 60e3);

function showPin(msg){
  $('#tabbar').hidden = true;
  main.innerHTML = `<form class="pin" id="pinForm">
    <h1>Sign in</h1><p class="lede">Enter the equipment viewer PIN, or the office PIN to make changes.</p>
    <input type="password" id="pin" inputmode="text" autocomplete="current-password" autocapitalize="off" spellcheck="false" aria-label="PIN" placeholder="PIN">
    <div class="msg warn" id="pinErr" role="alert" ${msg ? '' : 'hidden'}>${esc(msg || '')}</div>
    <button class="btn" type="submit" id="pinGo">Sign in</button></form>`;
  $('#pin').focus();
  $('#pinForm').onsubmit = async ev => {
    ev.preventDefault();
    const go = $('#pinGo'); go.disabled = true; go.textContent = 'Checking…';
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: $('#pin').value }) }).catch(() => null);
    if (r && r.ok) { const b = await r.json().catch(() => ({})); return b.needName ? showName() : load(); }
    const err = r ? (await r.json().catch(() => ({}))).error : 'No connection. Check your signal and try again.';
    showPin(err || 'Sign-in failed. Try again.');
  };
}

function showMessage(html, spin){ $('#tabbar').hidden = true; main.innerHTML = `<div class="msg ${spin ? 'info' : 'warn'}">${spin ? '<span class="spinner"></span>' : ''}<span>${html}</span></div>`; }

async function fetchData(){
  const r = await fetch('/api/data', { cache: 'no-store' }).catch(() => null);
  if (!r) return { error: 'No connection. Check your signal and try again.' };
  if (r.status === 401) return { signin: true };
  const body = await r.json().catch(() => ({}));
  if (r.status === 202) return { waiting: true, error: body.error };
  if (!r.ok) return { error: body.error || 'Something went wrong. Try again.' };
  return { data: body };
}

let waitedSince = 0;
async function load(){
  const res = await fetchData();
  if (res.signin) return showPin();
  if (res.error && !res.waiting) return showMessage(esc(res.error));
  if (res.waiting) {
    waitedSince ||= Date.now();
    if (res.error && Date.now() - waitedSince > 30e3) return showMessage(`Couldn't read Airtable: ${esc(res.error)}. Check the AIRTABLE_TOKEN setting in Netlify.`);
    showMessage('Getting the equipment list ready. The first time takes about 30 seconds…', true);
    return setTimeout(load, 5000);
  }
  waitedSince = 0;
  const first = !D;
  prepare(res.data);
  showUpdated();
  $('#tabbar').hidden = false;
  $('#fab').hidden = !isOffice();
  if (first) render(); else rerenderKeepingPlace();
}

// After a refresh, redraw the current screen in place.
function rerenderKeepingPlace(){
  const y = window.scrollY;
  const open = $('.band .eqid');
  if (open) { const e = EQ.find(x => x.id === open.textContent); if (e) renderMachine(e); else render(); }
  else render();
  window.scrollTo(0, y);
}

async function refreshNow(){
  const b = $('#refresh'); b.disabled = true; b.textContent = 'Refreshing…';
  const before = D.asOf;
  const r = await fetch('/api/refresh', { method: 'POST' }).then(x => x.json()).catch(() => ({}));
  if (!r.started) { b.textContent = 'Up to date'; return setTimeout(showUpdated, 2500); }
  for (let i = 0; i < 24; i++) {
    await new Promise(ok => setTimeout(ok, 5000));
    const res = await fetchData();
    if (res.data && res.data.asOf !== before) { prepare(res.data); showUpdated(); return rerenderKeepingPlace(); }
  }
  showUpdated();
}

// Pick up the 15-minute refresh when someone comes back to the app.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !D || Date.now() - D.asOf < 10 * 60e3) return;
  const res = await fetchData();
  if (res.data && res.data.asOf !== D.asOf) { prepare(res.data); showUpdated(); rerenderKeepingPlace(); }
});

