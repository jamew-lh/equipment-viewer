
// ================= office editing =================
// Office users (signed in with the office PIN) can add moves, mark scheduled
// moves done, edit machine details, add photos and add machines.
// Every save goes to Airtable through /api, then updates this page right away.

const isOffice = () => !!(D && D.office);
const isOpen = m => m[8] === 'Scheduled' || m[8] === 'Need';
const localDate = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
const idKey = s => String(s || '').replace(/\(.*?\)/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function api(method, path, body){
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).catch(() => null);
  if (!r) throw new Error('No connection. Check your signal and try again. Nothing was saved.');
  const b = await r.json().catch(() => ({}));
  if (r.status === 409) { const e = new Error(b.error || 'Someone else changed this in Airtable.'); e.conflict = b.current; throw e; }
  if (!r.ok) throw new Error(b.error || 'Saving failed. Try again.');
  return b;
}

// ---------- choices for the dropdowns (from Airtable's own lists) ----------
function siteOptions(selected, { allowBlank = false } = {}){
  const inUse = new Set(EQ.filter(e => !e.retired && !e.hidden && e.loc).map(e => e.loc));
  const all = [...new Set([...(D.choices?.loc || []), ...inUse])];
  const a = all.filter(s => inUse.has(s)).sort((x,y) => x.localeCompare(y));
  const b = all.filter(s => !inUse.has(s)).sort((x,y) => x.localeCompare(y));
  const opt = s => `<option ${s===selected?'selected':''}>${esc(s)}</option>`;
  const extra = selected && !all.includes(selected) ? opt(selected) : '';
  return `${allowBlank ? '<option value="">Choose a site</option>' : ''}${extra}<optgroup label="Sites with equipment now">${a.map(opt).join('')}</optgroup>
    <optgroup label="Other sites">${b.map(opt).join('')}</optgroup><option value="__new">+ New site…</option>`;
}
const listOptions = (list, selected) => `<option value="">Not set</option>${[...new Set([...(list||[]), ...(selected && !(list||[]).includes(selected) ? [selected] : [])])].map(v => `<option ${v===selected?'selected':''}>${esc(v)}</option>`).join('')}`;
function frequent(col, sinceYear = '2025'){
  const c = {}; MV.forEach(m => { const v = (m[col]||'').trim(); if (v && m[0] >= sinceYear) c[v] = (c[v]||0) + 1; });
  return Object.entries(c).filter(([,n]) => n >= 3).sort((a,b) => b[1]-a[1]).map(([v]) => v).slice(0, 15);
}

// ---------- sheet: full screen on phones, a dialog on desktop ----------
const sheetEl = document.getElementById('sheet');
function openSheet(title, body, opts = {}){
  const saveLabel = opts.saveLabel || 'Save';
  sheetEl.innerHTML = `<form class="card" id="sheetForm" novalidate>
    <header><h1>${esc(title)}</h1><button type="button" class="x" id="sheetX" aria-label="Close">✕</button></header>
    <div class="body">${body}<div class="msg warn" id="sheetErr" role="alert" hidden></div></div>
    <footer><button type="button" class="btn secondary" id="sheetCancel">Cancel</button><button type="submit" class="btn" id="sheetSave">${esc(saveLabel)}</button></footer></form>`;
  sheetEl.hidden = false; document.body.classList.add('locked');
  const close = () => { sheetEl.hidden = true; sheetEl.innerHTML = ''; document.body.classList.remove('locked'); };
  $('#sheetX').onclick = $('#sheetCancel').onclick = close;
  $('#sheetForm').onsubmit = async ev => {
    ev.preventDefault();
    const err = $('#sheetErr'); err.hidden = true;
    const save = $('#sheetSave'); save.disabled = true; const label = save.textContent; save.textContent = 'Saving…';
    try { if (await opts.onSave() !== false) close(); }
    catch (e) { err.innerHTML = esc(e.message); err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
    finally { if (!sheetEl.hidden) { save.disabled = false; save.textContent = label; } }
  };
  opts.onMount?.();
  const first = sheetEl.querySelector('[autofocus]'); if (first && matchMedia('(min-width: 700px)').matches) first.focus();
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !sheetEl.hidden) $('#sheetX').click(); });
function fail(msg){ throw new Error(msg); }
// "+ New site…" in a site dropdown shows a text box for the new name.
function wireNewSite(selId, inputId){
  const sel = $('#'+selId), inp = $('#'+inputId);
  const sync = () => { inp.hidden = sel.value !== '__new'; if (!inp.hidden) inp.focus(); };
  sel.onchange = sync; sync();
  return () => sel.value === '__new' ? inp.value.trim() : sel.value;
}

// ---------- toast with Undo ----------
let toastTimer, undoFn = null;
function toast(msg, undo){
  const t = $('#toast');
  t.innerHTML = `<span>${msg}</span>${undo ? '<button type="button" id="undo">Undo</button>' : ''}`;
  t.hidden = false; undoFn = undo || null;
  if (undo) $('#undo').onclick = async () => { const f = undoFn; undoFn = null; t.hidden = true;
    try { await f(); rerenderKeepingPlace(); toast('Undone.'); } catch (e) { toast(esc(e.message)); } };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; undoFn = null; }, undo ? 30000 : 4000);
}

// Keeps a copy of what's about to change so Undo can put it back.
function remember(e){ return { e, before: e ? JSON.parse(JSON.stringify(e)) : null, mv: MV.slice(), log: D.log.length, matched: D.stats.matched }; }
function restore(r){
  if (r.e) { for (const k of Object.keys(r.e)) if (!(k in r.before)) delete r.e[k]; Object.assign(r.e, r.before); }
  D.mv.length = 0; D.mv.push(...r.mv); D.log.length = r.log; D.stats.matched = r.matched; prepare(D);
}

function addLog(e, field, from, to){ D.log.unshift({ at: Date.now(), by: D.office.name, rec: e.rec, id: e.id, field, from: from || '', to: to || '' }); }
function insertMove(m){ let i = MV.findIndex(x => (x[0]||'') <= m[0]); if (i < 0) i = MV.length; MV.splice(i, 0, m); D.stats.matched++; }

function changePanel(e){
  const rows = D.log.filter(x => x.rec === e.rec || (x.id && x.id === e.id));
  if (!rows.length && !isOffice()) return '';
  const when = t => new Date(t).toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `<div class="panel"><h2>Changes made in the app <small>${rows.length || ''}</small></h2>
    ${rows.length ? `<div class="log">${rows.map(x => `<div class="lg"><span class="d">${when(x.at)}</span><span><b>${esc(x.field)}</b> ${x.from ? `${esc(x.from)} <span class="ar">→</span> ` : ''}${esc(x.to || '(cleared)')}</span><span class="by">${esc(x.by)}</span></div>`).join('')}</div>`
      : '<p class="sub">Every change made here is listed with who made it, and saved to the Change Log table in Airtable.</p>'}</div>`;
}

function photoTile(e, f){
  const src = f[3] || (window.SAMPLE ? '' : fileUrl(e, f));
  if (!src) return `<div class="ph"><span>PHOTO</span><small>${esc(f[1])}</small></div>`;
  return `<button type="button" data-photo="${src}" aria-label="${esc(f[1])}"><img src="${f[3] ? src : src + '&s=thumb'}" alt="${esc(f[1])}" loading="lazy"></button>`;
}

// ---------- add a move ----------
function moveForm({ eq = null }){
  let picked = eq;
  const today = localDate();
  const drivers = frequent(5), trucks = frequent(6);
  openSheet(eq ? `Add move · ${eq.id}` : 'Add move', `
    <div class="fg"><label for="mvQ">Machine</label>
      <div id="mvPicked" class="picked" ${picked ? '' : 'hidden'}></div>
      <div id="mvSearch" ${picked ? 'hidden' : ''}><input id="mvQ" type="search" placeholder="Type an ID, e.g. 336 or D6" autocomplete="off" autofocus>
      <div id="mvList" class="picklist"></div></div></div>
    <div class="fg2">
      <div class="fg"><label for="mvFrom">From</label><select id="mvFrom">${siteOptions(picked?.loc, { allowBlank: true })}</select><input id="mvFromNew" placeholder="New site name" hidden></div>
      <div class="fg"><label for="mvTo">To</label><select id="mvTo">${siteOptions('', { allowBlank: true })}</select><input id="mvToNew" placeholder="New site name" hidden></div>
    </div>
    <div class="fg"><span class="lbl">Status</span><div class="seg" id="mvSt">${['Complete','Scheduled','Need'].map((s,i) => `<label><input type="radio" name="mvSt" value="${s}" ${i?'':'checked'}><span>${s}</span></label>`).join('')}</div></div>
    <div class="fg2">
      <div class="fg"><label for="mvDate">Date</label><input id="mvDate" type="date" value="${today}"></div>
      <div class="fg"><label for="mvPermit">Permit #</label><input id="mvPermit" inputmode="numeric" placeholder="n/a"></div>
    </div>
    <div class="fg2">
      <div class="fg"><label for="mvDriver">Driver</label><input id="mvDriver" list="dlDrivers" autocomplete="off"><datalist id="dlDrivers">${drivers.map(d => `<option value="${esc(d)}">`).join('')}</datalist></div>
      <div class="fg"><label for="mvTruck">Truck</label><input id="mvTruck" list="dlTrucks" autocomplete="off" class="mono"><datalist id="dlTrucks">${trucks.map(d => `<option value="${esc(d)}">`).join('')}</datalist></div>
    </div>
    <p class="note" id="mvNote"></p>`, {
    saveLabel: 'Save move',
    onMount(){
      const showPicked = () => {
        $('#mvPicked').hidden = !picked; $('#mvSearch').hidden = !!picked;
        if (picked) $('#mvPicked').innerHTML = `<span class="id">${esc(picked.id)}</span><span class="mm">${esc([picked.mk, picked.md].filter(Boolean).join(' ') || picked.ty)}<small>Now at ${esc(picked.loc || 'no location')}</small></span>${eq ? '' : '<button type="button" class="mini" id="mvChange">Change</button>'}`;
        if ($('#mvChange')) $('#mvChange').onclick = () => { picked = null; showPicked(); $('#mvQ').focus(); };
      };
      const list = () => {
        const q = idKey($('#mvQ').value);
        const hits = q ? EQ.filter(e => !e.hidden && !e.old && idKey(e.id).includes(q)).sort((a,b) => idKey(a.id).indexOf(q) - idKey(b.id).indexOf(q) || a.id.localeCompare(b.id, undefined, {numeric:true})).slice(0, 8) : [];
        $('#mvList').innerHTML = hits.map(e => `<button type="button" data-pick="${e.i}"><span class="id">${esc(e.id)}</span><span class="mm">${esc([e.mk, e.md].filter(Boolean).join(' ') || e.ty)}<small>${esc(e.loc || 'No location')}</small></span></button>`).join('')
          || (q ? '<p class="sub">No machine with that ID. Check the ID, or add the machine under Fleet first.</p>' : '');
      };
      $('#mvQ').oninput = list;
      $('#mvList').onclick = ev => { const b = ev.target.closest('[data-pick]'); if (!b) return; picked = EQ[+b.dataset.pick];
        const sel = $('#mvFrom'); sel.innerHTML = siteOptions(picked.loc, { allowBlank: true }); sel.dispatchEvent(new Event('change')); showPicked(); note(); };
      const getFrom = wireNewSite('mvFrom', 'mvFromNew'), getTo = wireNewSite('mvTo', 'mvToNew');
      const note = () => {
        const st = sheetEl.querySelector('[name=mvSt]:checked').value, to = getTo();
        $('#mvNote').innerHTML = !picked || !to ? '' : st === 'Complete'
          ? `Saving sets <b>${esc(picked.id)}</b>'s Location to <b>${esc(to)}</b>.`
          : `${esc(picked.id)} stays at ${esc(picked.loc || 'its current site')} until you mark this move done.`;
      };
      $('#sheetForm').addEventListener('change', note); $('#sheetForm').addEventListener('input', note); showPicked(); note();
      this.read = () => ({ getFrom, getTo });
    },
    async onSave(){
      const { getFrom, getTo } = this.read();
      const st = sheetEl.querySelector('[name=mvSt]:checked').value;
      const v = { from: getFrom(), to: getTo(), date: $('#mvDate').value, driver: $('#mvDriver').value.trim(), truck: $('#mvTruck').value.trim(), permit: $('#mvPermit').value.trim(), status: st };
      if (!picked) fail('Pick the machine that moved.');
      if (!v.to) fail('Pick where it went.');
      if (v.to === v.from) fail('From and To are the same site.');
      if (!v.date) fail('Enter the date of the move.');
      const res = await api('POST', '/api/moves', { rec: picked.rec, id: picked.id, expectLoc: picked.loc, ...v });
      const mem = remember(picked);
      insertMove([v.date, picked.id, picked.i, v.from, v.to, v.driver, v.truck, v.permit || 'n/a', st, '', '', res.id, D.office.name]);
      addLog(picked, st === 'Complete' ? 'Move' : `Move (${st})`, v.from, v.to);
      if (st === 'Complete' && picked.loc !== v.to) { addLog(picked, 'Location', picked.loc, v.to); picked.loc = v.to; }
      prepare(D); rerenderKeepingPlace();
      const who = picked;
      toast(st === 'Complete' ? `Move saved. <b>${esc(who.id)}</b> is now at ${esc(v.to)}.` : `${st} move saved for <b>${esc(who.id)}</b>.`,
        async () => { await api('POST', '/api/undo', { token: res.undo }); restore(mem); });
    },
  });
}

// ---------- mark a scheduled move done ----------
main.addEventListener('click', ev => {
  const b = ev.target.closest('[data-done]'); if (!b) return;
  ev.stopPropagation();
  const m = MV[+b.dataset.done], e = m[2] >= 0 ? EQ[m[2]] : null;
  openSheet(`Mark move done${e ? ` · ${e.id}` : ''}`, `
    <p class="lede" style="margin:0 0 4px">${esc(m[3] || '?')} <span class="ar">→</span> ${esc(m[4] || '?')}, ${m[8].toLowerCase()} since ${fmt(m[0])}</p>
    <div class="fg"><label for="dnDate">Date it moved</label><input id="dnDate" type="date" value="${localDate()}"></div>
    <p class="note">${e ? `Saving sets <b>${esc(e.id)}</b>'s Location to <b>${esc(m[4])}</b>.` : 'This move isn\'t linked to a machine, so no Location changes.'}</p>`, {
    saveLabel: 'Mark done',
    async onSave(){
      const date = $('#dnDate').value; if (!date) fail('Enter the date it moved.');
      const res = await api('POST', '/api/moves/done', { move: m[11], rec: e?.rec, to: m[4], date });
      const mem = remember(e);
      const i = MV.indexOf(m); MV.splice(i, 1);
      const done = m.slice(); done[0] = date; done[8] = 'Complete'; D.stats.matched--; insertMove(done);
      if (e) { addLog(e, 'Move', m[3], `${m[4]} (marked done)`); if (e.loc !== m[4]) { addLog(e, 'Location', e.loc, m[4]); e.loc = m[4]; } }
      prepare(D); rerenderKeepingPlace();
      toast(`Move marked done${e ? `. <b>${esc(e.id)}</b> is now at ${esc(m[4])}` : ''}.`, async () => { await api('POST', '/api/undo', { token: res.undo }); restore(mem); });
    },
  });
}, true);

// ---------- edit a machine, or add a new one ----------
const EDIT_FIELDS = [
  ['loc', 'Location'], ['st', 'Status'], ['ty', 'Type'], ['mk', 'Make'], ['md', 'Model'], ['yr', 'Year'],
  ['sn', 'Serial number'], ['wt', 'Operating weight'], ['dl', 'Dealer'], ['flt', 'Filter list'], ['tooth', 'Tooth type'], ['nt', 'Notes'],
];
function editMachine(e){
  const isNew = !e;
  const v = e || { id: '', loc: '', st: 'In Service', ty: '', mk: '', md: '', yr: '', sn: '', wt: '', dl: [], flt: '', tooth: '', nt: '', f: [] };
  const C = D.choices || {};
  openSheet(isNew ? 'Add machine' : `Edit ${e.id}`, `
    ${isNew ? `<div class="fg"><label for="edId">Equipment ID</label><input id="edId" class="mono" autocapitalize="characters" placeholder="e.g. 336-07" autofocus></div>` : ''}
    <div class="fg2">
      <div class="fg"><label for="edLoc">Location</label><select id="edLoc">${siteOptions(v.loc, { allowBlank: true })}</select><input id="edLocNew" placeholder="New site name" hidden></div>
      <div class="fg"><label for="edSt">Status</label><select id="edSt">${listOptions(C.st, v.st)}</select></div>
    </div>
    <label class="check" id="edMoveWrap" hidden><input type="checkbox" id="edMove" checked> <span>Also log this as a move, from <b id="edFrom"></b> to <b id="edTo"></b>, dated today</span></label>
    <div class="fg2">
      <div class="fg"><label for="edTy">Type</label><select id="edTy">${listOptions(C.ty, v.ty)}</select></div>
      <div class="fg"><label for="edYr">Year</label><input id="edYr" inputmode="numeric" value="${esc(v.yr)}"></div>
    </div>
    <div class="fg2">
      <div class="fg"><label for="edMk">Make</label><input id="edMk" value="${esc(v.mk)}" list="dlMakes"><datalist id="dlMakes">${[...new Set(EQ.map(x => x.mk).filter(Boolean))].sort().map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div class="fg"><label for="edMd">Model</label><input id="edMd" value="${esc(v.md)}"></div>
    </div>
    <div class="fg2">
      <div class="fg"><label for="edSn">Serial number</label><input id="edSn" class="mono" value="${esc(v.sn)}"></div>
      <div class="fg"><label for="edWt">Operating weight (lb)</label><input id="edWt" inputmode="numeric" value="${esc(v.wt)}"></div>
    </div>
    <div class="fg"><span class="lbl">Dealer</span><div class="chips" id="edDl">${[...new Set([...(C.dl || []), ...v.dl])].map(d => `<button type="button" class="chip" aria-pressed="${v.dl.includes(d)}" data-dl="${esc(d)}">${esc(d)}</button>`).join('')}</div></div>
    <div class="fg2">
      <div class="fg"><label for="edFlt">Filter list</label><input id="edFlt" class="mono" value="${esc(v.flt)}"></div>
      <div class="fg"><label for="edTooth">Tooth type</label><input id="edTooth" value="${esc(v.tooth)}"></div>
    </div>
    <div class="fg"><label for="edNt">Notes</label><textarea id="edNt" rows="4">${esc(v.nt)}</textarea></div>`, {
    saveLabel: isNew ? 'Add machine' : 'Save changes',
    onMount(){
      const getLoc = wireNewSite('edLoc', 'edLocNew');
      $('#edDl').onclick = ev => { const b = ev.target.closest('[data-dl]'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); };
      const moveHint = () => { const to = getLoc(); const show = !isNew && v.loc && to && to !== v.loc;
        $('#edMoveWrap').hidden = !show; if (show) { $('#edFrom').textContent = v.loc; $('#edTo').textContent = to; } };
      $('#edLoc').addEventListener('change', moveHint); $('#edLocNew').oninput = moveHint;
      this.getLoc = getLoc;
    },
    async onSave(){
      const next = { loc: this.getLoc(), st: $('#edSt').value, ty: $('#edTy').value, mk: $('#edMk').value.trim(), md: $('#edMd').value.trim(),
        yr: $('#edYr').value.trim(), sn: $('#edSn').value.trim(), wt: $('#edWt').value.trim(),
        dl: [...sheetEl.querySelectorAll('[data-dl][aria-pressed="true"]')].map(b => b.dataset.dl),
        flt: $('#edFlt').value.trim(), tooth: $('#edTooth').value.trim(), nt: $('#edNt').value.replace(/\s+$/, '') };
      if (next.yr && !/^(19|20)\d\d$/.test(next.yr)) fail('Year should be four digits, like 2019.');
      if (isNew) {
        const id = $('#edId').value.trim().toUpperCase();
        if (!id) fail('Enter the Equipment ID.');
        const dup = EQ.find(x => idKey(x.id) === idKey(id));
        if (dup) fail(`${dup.id} already exists${dup.old ? ' in Old Equipment' : ''}. Open it from Fleet to edit it.`);
        if (!next.ty) fail('Pick a Type, so the machine shows up on Jobsites and Fleet.');
        const res = await api('POST', '/api/machines', { id, ...next });
        const ne = { id, rec: res.rec, old: 0, ...next, f: [] };
        const mem = remember(null);
        D.eq.push(ne); prepare(D); addLog(ne, 'Added machine', '', `${id}${next.loc ? ` at ${next.loc}` : ''}`);
        stack.push({ tab, site: state.site, y: 0 }); renderMachine(ne); window.scrollTo(0, 0);
        return toast(`Added <b>${esc(id)}</b>.`, async () => { await api('POST', '/api/undo', { token: res.undo }); D.eq.pop(); restore(mem); goBack(); });
      }
      const changed = EDIT_FIELDS.filter(([k]) => JSON.stringify(next[k] ?? '') !== JSON.stringify(e[k] ?? ''));
      if (!changed.length) return true;
      const logMove = !$('#edMoveWrap').hidden && $('#edMove').checked;
      const before = Object.fromEntries(changed.map(([k]) => [k, e[k]]));
      const res = await api('PATCH', '/api/machines', { rec: e.rec, expect: before, set: Object.fromEntries(changed.map(([k]) => [k, next[k]])), logMove, date: localDate() });
      const mem = remember(e);
      for (const [k, label] of changed) {
        const show = x => Array.isArray(x) ? x.join(', ') : k === 'nt' ? (x ? 'edited' : '') : x;
        addLog(e, label, k === 'nt' ? '' : show(e[k]), k === 'nt' ? (next.nt ? 'Notes edited' : '') : show(next[k]));
        e[k] = next[k];
      }
      if (logMove) { insertMove([localDate(), e.id, e.i, before.loc, next.loc, '', '', 'n/a', 'Complete', '', '', res.moveId, D.office.name]); addLog(e, 'Move', before.loc, next.loc); }
      prepare(D); rerenderKeepingPlace();
      toast(`Saved ${changed.length} change${changed.length === 1 ? '' : 's'} to <b>${esc(e.id)}</b>.`, async () => { await api('POST', '/api/undo', { token: res.undo }); restore(mem); });
    },
  });
}

// ---------- photos and PDFs ----------
// Phone photos are shrunk to 2000 px before upload (Airtable takes up to 5 MB per file).
async function shrink(file){
  if (!file.type.startsWith('image/')) return file;
  const img = await createImageBitmap(file).catch(() => null); if (!img) return file;
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(ok => c.toBlob(b => ok(new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.85));
}
async function addFiles(e, files){
  files = [...files]; if (!files.length) return;
  toast(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
  try {
    const mem = remember(e), tokens = [];
    for (const f0 of files) {
      const f = await shrink(f0);
      if (f.size > 5e6) fail(`${f0.name} is over 5 MB. Airtable won't take files that large from the app.`);
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
      const res = await api('POST', '/api/files', { rec: e.rec, name: f.name, type: f.type, data });
      tokens.push(res.undo);
      e.f.push([res.id, f.name, f.type.startsWith('image/') ? 'photo' : f.type.includes('pdf') ? 'pdf' : 'file', URL.createObjectURL(f)]);
      addLog(e, 'Added file', '', f.name);
    }
    rerenderKeepingPlace();
    toast(`Added ${files.length} file${files.length === 1 ? '' : 's'} to <b>${esc(e.id)}</b>.`, async () => { for (const token of tokens.reverse()) await api('POST', '/api/undo', { token }); restore(mem); });
  } catch (err) { rerenderKeepingPlace(); toast(esc(err.message)); }
}

// ---------- office sign-in: who is making changes ----------
function showName(msg){
  $('#tabbar').hidden = true;
  let last = ''; try { last = localStorage.getItem('lhv-office-name') || ''; } catch {}
  main.innerHTML = `<form class="pin" id="nameForm">
    <h1>Office sign-in</h1><p class="lede">Your name goes on every move and change you make.</p>
    <input type="text" id="offName" autocomplete="name" placeholder="Your name, e.g. James W" value="${esc(last)}" style="letter-spacing:0;font:600 20px var(--f-body)">
    <div class="msg warn" id="pinErr" role="alert" ${msg ? '' : 'hidden'}>${esc(msg || '')}</div>
    <button class="btn" type="submit">Continue</button></form>`;
  $('#offName').focus();
  $('#nameForm').onsubmit = async ev => {
    ev.preventDefault();
    const name = $('#offName').value.trim(); if (name.length < 2) return showName('Enter your name.');
    try { localStorage.setItem('lhv-office-name', name); } catch {}
    try { await api('POST', '/api/login/name', { name }); load(); } catch (e) { showName(e.message); }
  };
}

$('#fab').onclick = () => moveForm({});

load();
