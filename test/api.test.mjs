import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../lib/app.mjs';
import { syncNow } from '../lib/sync.mjs';
import { memoryStore } from '../lib/store.mjs';
import { makeSiteNamer } from '../lib/sites.mjs';
import { idKey } from '../lib/build.mjs';
import { makeAirtable } from '../lib/airtable.mjs';
import { fakeAirtable } from './fake-airtable.mjs';

const env = { AIRTABLE_TOKEN: 'patX', SESSION_SECRET: 's'.repeat(32), VIEWER_PIN: '2468' };

function setup(over = {}) {
  let t = Date.parse('2026-10-14T13:00:00Z');
  const deps = {
    env, store: memoryStore(), airtable: fakeAirtable(), now: () => t, ip: '1.2.3.4', log: () => {},
    syncs: 0, triggerSync: async () => { deps.syncs++; },
    ...over,
  };
  const call = (path, { method = 'GET', body, cookie } = {}) => handle(new Request(`https://x.test${path}`, {
    method, body: body && JSON.stringify(body), headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
  }), deps);
  const signIn = async () => (await call('/api/login', { method: 'POST', body: { pin: '2468' } })).headers.get('set-cookie').split(';')[0];
  return { deps, call, signIn, advance: (ms) => { t += ms; } };
}

test('wrong PIN is refused, right PIN signs in for 60 days', async () => {
  const { call } = setup();
  assert.equal((await call('/api/login', { method: 'POST', body: { pin: '1111' } })).status, 401);
  const ok = await call('/api/login', { method: 'POST', body: { pin: ' 2468 ' } });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly; Secure/);
  assert.match(ok.headers.get('set-cookie'), /Max-Age=5184000/);
});

test('data needs sign-in, and a changed PIN signs everyone out', async () => {
  const { call, signIn, deps } = setup();
  assert.equal((await call('/api/data')).status, 401);
  const cookie = await signIn();
  assert.notEqual((await call('/api/data', { cookie })).status, 401);
  deps.env = { ...env, VIEWER_PIN: '9999' };
  assert.equal((await call('/api/data', { cookie })).status, 401);
});

test('repeated wrong PINs lock out for 10 minutes', async () => {
  const { call, advance } = setup();
  for (let i = 0; i < 8; i++) await call('/api/login', { method: 'POST', body: { pin: '0000' } });
  assert.equal((await call('/api/login', { method: 'POST', body: { pin: '2468' } })).status, 429);
  advance(11 * 60e3);
  assert.equal((await call('/api/login', { method: 'POST', body: { pin: '2468' } })).status, 200);
});

test('missing setting gives a clear message', async () => {
  const { call } = setup({ env: { ...env, VIEWER_PIN: '' } });
  const r = await call('/api/data');
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /VIEWER_PIN/);
});

test('first load starts one refresh and says so; then data arrives', async () => {
  const { call, signIn, deps } = setup();
  const cookie = await signIn();
  let r = await call('/api/data', { cookie });
  assert.equal(r.status, 202);
  assert.equal((await r.json()).syncing, true);
  await call('/api/data', { cookie });
  assert.equal(deps.syncs, 1, 'a second load while refreshing does not start another');
  await syncNow(deps);
  r = await call('/api/data', { cookie });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.stats.equipment, 199);
  assert.equal(d.stats.old, 25);
  assert.equal(d.stats.moves, 4935);
  assert.ok(d.stats.matched >= 4480, `matched ${d.stats.matched}`);
  assert.ok(!JSON.stringify(d.eq).includes('/fake-file/'), 'file links are not sent to the page');
});

test('real data: Location decides where a machine is; moves are matched and newest first', async () => {
  const { call, signIn, deps } = setup();
  await syncNow(deps);
  const d = await (await call('/api/data', { cookie: await signIn() })).json();
  const d6 = d.eq.findIndex((e) => e.id === 'D6T-03');
  assert.equal(d.eq[d6].loc, '1201 Colllegeville');
  const hist = d.mv.filter((m) => m[2] === d6);
  assert.equal(hist.length, 49);
  assert.equal(hist[0][0], '2026-06-11');
  assert.equal(hist[0][4], '1201 Colllegeville');
  const old = d.eq.findIndex((e) => e.id === '333-02');
  assert.equal(d.eq[old].old, 1);
  assert.equal(d.mv.filter((m) => m[2] === old).length, 153);
  assert.ok(d.mv[0][0] >= d.mv[d.mv.length - 1][0]);
});

test('site spellings group together', () => {
  const name = makeSiteNamer(['Brandywine Walk', 'TOA 3', 'Culbertson', '1201 Colllegeville', 'HB Shop', 'Stonebrook']);
  for (const s of ['BWW', 'Brandywine walk', 'Brnaywine Walk']) assert.equal(name(s), 'Brandywine Walk');
  for (const s of ['TOA', 'TOA3', 'TOA III']) assert.equal(name(s), 'TOA 3');
  for (const s of ['Culebrtson', 'Culbetson']) assert.equal(name(s), 'Culbertson');
  for (const s of ['1201', '1201 Collegeville']) assert.equal(name(s), '1201 Colllegeville');
  for (const s of ['HB SHop', 'Hb Shop', 'HB Shpop']) assert.equal(name(s), 'HB Shop');
  assert.equal(name('Stonerbrook'), 'Stonebrook');
  assert.equal(name('Somewhere New'), 'Somewhere New');
});

test('equipment IDs match across spellings', () => {
  assert.equal(idKey('TB20-07 (6)'), idKey('TB20-07'));
  assert.equal(idKey('Build-A-Box-01'), idKey('BuildABox-01'));
  assert.equal(idKey('d6t-03'), idKey('D6T-03'));
});

test('files open through the app; old links are refreshed from Airtable', async () => {
  const { call, signIn, deps, advance } = setup();
  await syncNow(deps);
  const cookie = await signIn();
  const d = await (await call('/api/data', { cookie })).json();
  const e = d.eq.find((x) => x.f.some((f) => f[2] === 'photo'));
  const f = e.f.find((x) => x[2] === 'photo');
  let r = await call(`/api/file?r=${e.rec}&a=${f[0]}&s=thumb`, { cookie });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /thumb=1/);
  assert.equal(deps.airtable.calls.filter((c) => c[0] === 'get').length, 0);
  advance(2 * 3600e3);
  r = await call(`/api/file?r=${e.rec}&a=${f[0]}`, { cookie });
  assert.equal(r.status, 302);
  assert.equal(deps.airtable.calls.filter((c) => c[0] === 'get').length, 1);
  assert.equal((await call(`/api/file?r=${e.rec}&a=attNOPE`, { cookie })).status, 404);
});

test('an old copy is still shown while a refresh starts', async () => {
  const { call, signIn, deps, advance } = setup();
  await syncNow(deps);
  const cookie = await signIn();
  advance(20 * 60e3);
  const r = await call('/api/data', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-refreshing'), 'true');
  assert.equal(deps.syncs, 1);
});

test('refresh button does nothing if the copy is under 2 minutes old', async () => {
  const { call, signIn, deps, advance } = setup();
  await syncNow(deps);
  const cookie = await signIn();
  assert.equal((await (await call('/api/refresh', { method: 'POST', cookie })).json()).started, false);
  advance(5 * 60e3);
  assert.equal((await (await call('/api/refresh', { method: 'POST', cookie })).json()).started, true);
  assert.equal(deps.syncs, 1);
});

test('a refused Airtable token is reported, and the lock is released', async () => {
  const { deps } = setup({ airtable: fakeAirtable({ failWith: 403 }) });
  await assert.rejects(syncNow(deps));
  assert.equal((await deps.store.get('sync-lock')).at, 0);
  assert.ok((await deps.store.get('sync-error')).message);
});

test('Airtable client pages through results and only reads', async () => {
  const seen = [];
  const pages = [{ records: [{ id: 'rec1' }], offset: 'o1' }, { records: [{ id: 'rec2' }] }];
  const at = makeAirtable({ token: 't', baseId: 'appX', pauseMs: 0, fetchImpl: async (url, init) => {
    seen.push([url, init.method || 'GET']);
    return new Response(JSON.stringify(pages.shift()), { status: 200 });
  } });
  const recs = await at.listAll('tblA', ['fld1', 'fld2']);
  assert.deepEqual(recs.map((r) => r.id), ['rec1', 'rec2']);
  assert.ok(seen.every(([, m]) => m === 'GET'));
  assert.match(seen[1][0], /offset=o1/);
  assert.match(seen[0][0], /fields%5B%5D=fld1/);
});

test('close but different sites stay separate', () => {
  const name = makeSiteNamer(['Culbertson', 'Culbertson East', 'Brandywine Walk', 'Brandywine Square', 'Morgantown LD']);
  assert.equal(name('Culbertson E'), 'Culbertson East');
  assert.equal(name('Brandywine'), 'Brandywine');
  assert.equal(name('Morgantown Field'), 'Morgantown Field');
});

test('office TV screen: needs the right key, and lists every jobsite with its equipment', async () => {
  const deps0 = setup({ env: { ...env, TV_KEY: 'k'.repeat(32) } });
  const { call, deps } = deps0;
  assert.equal((await call('/tv?key=wrong')).status, 403);
  const page = await call(`/tv?key=${'k'.repeat(32)}`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal((await call(`/api/tv?key=${'k'.repeat(32)}`)).status, 202, 'no data yet: it starts a refresh');
  await syncNow(deps);
  const d = await (await call(`/api/tv?key=${'k'.repeat(32)}`)).json();
  assert.equal(d.total, 173, 'only machines with TRACKING ticked');
  assert.equal(d.sites.reduce((n, s) => n + s.count, 0), 173);
  const toa = d.sites.find((s) => s.name === 'TOA 3');
  assert.deepEqual(toa.groups.map((g) => g.type).slice(0, 3), ['Excavators', 'Dozers', 'Trucks']);
  assert.equal(toa.groups.at(-1).type, 'Buckets');
  for (const id of ['H3200', 'LEROI AIR COMPRESSOR', 'CVP75-01']) assert.ok(!JSON.stringify(d.sites).includes(id), `${id} has TRACKING unticked`);
  assert.equal(d.open.length, 1);
  const off = setup({ env: { ...env, TV_KEY: '' } });
  assert.equal((await off.call('/tv?key=x')).status, 404);
});

test('a saved copy made by older code is shown in full and rebuilt straight away', async () => {
  const { call, signIn, deps } = setup();
  await syncNow(deps);
  // Make it look like a copy saved before TRACKING existed, 1 minute ago.
  const snap = await deps.store.get('snapshot');
  delete snap.v; for (const e of snap.eq) delete e.tk;
  await deps.store.set('snapshot', snap);
  const cookie = await signIn();
  const r = await call('/api/data', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-refreshing'), 'true', 'it starts a fresh read even though the copy is new');
  assert.equal(deps.syncs, 1);
  assert.ok((await r.json()).eq.every((e) => e.tk === undefined), 'no TRACKING values to hide anything with');
  assert.equal((await (await call('/api/refresh', { method: 'POST', cookie })).json()).started, true, 'Refresh is allowed too');
});
