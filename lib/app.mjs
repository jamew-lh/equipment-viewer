// The /api/* routes. Everything here only reads Airtable.
//   POST /api/login    { pin }            sign in
//   POST /api/logout                      sign out
//   GET  /api/data                        equipment + moves (the saved copy)
//   POST /api/refresh                     start a refresh from Airtable now
//   GET  /api/file?r=rec&a=att&s=thumb    open a photo or PDF
import { EQUIPMENT, OLD_EQUIPMENT, REFRESH_AFTER_MIN, FILE_LINKS_GOOD_FOR_MIN } from './config.mjs';
import { makeSession, clearSession, isSignedIn, sameText } from './auth.mjs';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (message, status) => json({ error: message }, status);

const failures = new Map(); // ip -> { n, until }

// What the page needs: no Airtable file links (those expire), just ids to ask /api/file for.
let lastClient = { asOf: null, body: null };
function forClient(snap) {
  if (lastClient.asOf === snap.asOf) return lastClient.body;
  const eq = snap.eq.map(({ f, ...e }) => ({ ...e, f: f.map((x) => [x.id, x.name, x.kind]) }));
  const body = JSON.stringify({ asOf: snap.asOf, eq, mv: snap.mv, stats: snap.stats });
  lastClient = { asOf: snap.asOf, body };
  return body;
}

// Starts a background refresh unless one began in the last 3 minutes.
async function startRefresh(deps) {
  const { store, now } = deps;
  const lock = (await store.get('sync-lock')) || { at: 0 };
  if (lock.at && now() - lock.at < 3 * 60e3) return true; // one is already running
  await store.set('sync-lock', { at: now() });
  try { await deps.triggerSync(); } catch (e) { deps.log?.(`Could not start refresh: ${e.message}`); await store.set('sync-lock', { at: 0 }); return false; }
  return true;
}

export async function handle(req, deps) {
  const { env, store, now } = deps;
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  try {
    for (const k of ['AIRTABLE_TOKEN', 'SESSION_SECRET', 'VIEWER_PIN']) if (!env[k]) return fail(`Server is missing ${k}. Add it under Netlify → Environment variables, then redeploy.`, 500);

    if (route === 'login' && req.method === 'POST') {
      const ip = deps.ip || 'x', f = failures.get(ip);
      if (f && f.n >= 8 && f.until > now()) return fail('Too many wrong PINs. Wait 10 minutes and try again.', 429);
      const { pin } = await req.json().catch(() => ({}));
      if (!pin || !sameText(String(pin).trim(), env.VIEWER_PIN)) {
        const n = (f && f.until > now() ? f.n : 0) + 1;
        failures.set(ip, { n, until: now() + 10 * 60e3 });
        return fail("That PIN isn't right.", 401);
      }
      failures.delete(ip);
      return json({ ok: true }, 200, { 'set-cookie': makeSession(env, now()) });
    }
    if (route === 'logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': clearSession() });

    if (!isSignedIn(req, env, now())) return fail('Sign in with the PIN.', 401);

    if (route === 'data' && req.method === 'GET') {
      const snap = await store.get('snapshot');
      if (!snap) {
        await startRefresh(deps);
        const err = await store.get('sync-error');
        return json({ syncing: true, error: err?.message || null }, 202);
      }
      const stale = now() - snap.asOf > REFRESH_AFTER_MIN * 60e3;
      const refreshing = stale ? await startRefresh(deps) : false;
      return new Response(forClient(snap), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-refreshing': String(refreshing) },
      });
    }

    if (route === 'refresh' && req.method === 'POST') {
      const snap = await store.get('snapshot');
      if (snap && now() - snap.asOf < 2 * 60e3) return json({ started: false, asOf: snap.asOf });
      return json({ started: await startRefresh(deps), asOf: snap?.asOf || null });
    }

    if (route === 'file' && req.method === 'GET') {
      const r = url.searchParams.get('r'), a = url.searchParams.get('a'), thumb = url.searchParams.get('s') === 'thumb';
      const snap = await store.get('snapshot');
      const e = snap?.eq.find((x) => x.rec === r);
      let file = e?.f.find((x) => x.id === a);
      if (!file) return fail('That file is no longer attached in Airtable.', 404);
      if (now() - snap.asOf > FILE_LINKS_GOOD_FOR_MIN * 60e3) {
        const T = e.old ? OLD_EQUIPMENT : EQUIPMENT;
        const rec = await deps.airtable.getRecord(T.table, r);
        const fresh = (rec.fields?.[T.fields.files] || []).find((x) => x.id === a);
        if (!fresh) return fail('That file is no longer attached in Airtable.', 404);
        file = { url: fresh.url, thumb: fresh.thumbnails?.large?.url || '' };
      }
      return new Response(null, { status: 302, headers: { location: (thumb && file.thumb) || file.url, 'cache-control': 'private, max-age=600' } });
    }

    return fail('Not found.', 404);
  } catch (e) {
    if (e.status === 401 || e.status === 403 || e.status === 404) return fail('Airtable refused the request. Check that AIRTABLE_TOKEN in Netlify can read the LH Equipment base.', 502);
    deps.log?.(`Error: ${e.stack || e.message}`);
    return fail('Something went wrong on the server. Try again.', 500);
  }
}
