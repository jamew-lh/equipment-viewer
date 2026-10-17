// The /api/* routes.
//   POST /api/login       { pin }      sign in (viewer PIN, or office PIN)
//   POST /api/login/name  { name }     office: who is making changes
//   POST /api/logout                   sign out
//   GET  /api/data                     equipment + moves (the saved copy)
//   POST /api/refresh                  start a refresh from Airtable now
//   GET  /api/file?r=rec&a=att&s=thumb open a photo or PDF
// Office only (these write to Airtable):
//   POST /api/moves, /api/moves/done, /api/machines, /api/files, /api/undo
//   PATCH /api/moves, /api/machines
import { EQUIPMENT, OLD_EQUIPMENT, REFRESH_AFTER_MIN, FILE_LINKS_GOOD_FOR_MIN } from './config.mjs';
import { makeSession, clearSession, session, sameText } from './auth.mjs';
import { buildTv, tvPage } from './tv.mjs';
import { addMove, editMove, moveDone, editMachine, addMachine, addFile, undo, EditError } from './edit.mjs';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (message, status, extra) => json({ error: message, ...extra }, status);

const failures = new Map(); // ip -> { n, until }

// What the page needs: no Airtable file links (those expire), just ids to ask /api/file for.
let lastClient = { key: null, body: null };
function forClient(snap, user) {
  const key = `${snap.asOf}.${snap.rev || ''}`;
  if (lastClient.key !== key) {
    const eq = snap.eq.map(({ f, ...e }) => ({ ...e, f: f.map((x) => [x.id, x.name, x.kind]) }));
    lastClient = { key, body: JSON.stringify({ asOf: snap.asOf, eq, mv: snap.mv, stats: snap.stats, choices: snap.choices || null, log: snap.log || [] }) };
  }
  const office = user.role === 'o' ? { name: user.name } : null;
  return lastClient.body.slice(0, -1) + `,"office":${JSON.stringify(office)}}`;
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

const EDITS = {
  'POST moves': addMove, 'PATCH moves': editMove, 'POST moves/done': moveDone, 'PATCH machines': editMachine,
  'POST machines': addMachine, 'POST files': addFile, 'POST undo': undo,
};

export async function handle(req, deps) {
  const { env, store, now } = deps;
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  try {
    for (const k of ['AIRTABLE_TOKEN', 'SESSION_SECRET', 'VIEWER_PIN']) if (!env[k]) return fail(`Server is missing ${k}. Add it under Netlify → Environment variables, then redeploy.`, 500);

    // Office TV screen: /tv?key=... (the page) and /api/tv?key=... (its data). The key is the password.
    if (url.pathname === '/tv' || route === 'tv') {
      const key = url.searchParams.get('key') || '';
      if (!env.TV_KEY) return fail('The office screen is turned off. Add TV_KEY in Netlify to turn it on.', 404);
      if (!key || !sameText(key, env.TV_KEY)) return fail('This screen link is not valid. Check the key at the end of the link.', 403);
      if (url.pathname === '/tv') return new Response(tvPage(key), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      const snap = await store.get('snapshot');
      if (!snap) { await startRefresh(deps); return json({ syncing: true }, 202); }
      if (now() - (snap.linksAt ?? snap.asOf) > REFRESH_AFTER_MIN * 60e3) await startRefresh(deps);
      return json(buildTv(snap, now()));
    }

    if (route === 'login' && req.method === 'POST') {
      const ip = deps.ip || 'x', f = failures.get(ip);
      if (f && f.n >= 8 && f.until > now()) return fail('Too many wrong PINs. Wait 10 minutes and try again.', 429);
      const pin = String((await req.json().catch(() => ({}))).pin || '').trim();
      const role = pin && sameText(pin, env.VIEWER_PIN) ? 'v' : pin && env.OFFICE_PIN && sameText(pin, env.OFFICE_PIN) ? 'p' : null;
      if (!role) {
        const n = (f && f.until > now() ? f.n : 0) + 1;
        failures.set(ip, { n, until: now() + 10 * 60e3 });
        return fail("That PIN isn't right.", 401);
      }
      failures.delete(ip);
      return json({ ok: true, needName: role === 'p' }, 200, { 'set-cookie': makeSession(env, now(), role) });
    }
    if (route === 'logout' && req.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': clearSession() });

    const user = session(req, env, now());
    if (!user) return fail('Sign in with the PIN.', 401);

    if (route === 'login/name' && req.method === 'POST') {
      if (user.role === 'v') return fail('Sign in with the office PIN first.', 403);
      const name = String((await req.json().catch(() => ({}))).name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (name.length < 2) return fail('Enter your name.', 400);
      return json({ ok: true }, 200, { 'set-cookie': makeSession(env, now(), 'o', name) });
    }
    if (user.role === 'p') return fail('Enter your name to finish signing in.', 401, { needName: true });

    if (route === 'data' && req.method === 'GET') {
      const snap = await store.get('snapshot');
      if (!snap) {
        await startRefresh(deps);
        const err = await store.get('sync-error');
        return json({ syncing: true, error: err?.message || null }, 202);
      }
      const stale = now() - (snap.linksAt ?? snap.asOf) > REFRESH_AFTER_MIN * 60e3;
      const refreshing = stale ? await startRefresh(deps) : false;
      return new Response(forClient(snap, user), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-refreshing': String(refreshing) },
      });
    }

    if (route === 'refresh' && req.method === 'POST') {
      const snap = await store.get('snapshot');
      if (snap && now() - (snap.linksAt ?? snap.asOf) < 2 * 60e3) return json({ started: false, asOf: snap.asOf });
      return json({ started: await startRefresh(deps), asOf: snap?.asOf || null });
    }

    if (route === 'file' && req.method === 'GET') {
      const r = url.searchParams.get('r'), a = url.searchParams.get('a'), thumb = url.searchParams.get('s') === 'thumb';
      const snap = await store.get('snapshot');
      const e = snap?.eq.find((x) => x.rec === r);
      let file = e?.f.find((x) => x.id === a);
      if (!file) return fail('That file is no longer attached in Airtable.', 404);
      if (now() - (snap.linksAt ?? snap.asOf) > FILE_LINKS_GOOD_FOR_MIN * 60e3 || !file.url) {
        const T = e.old ? OLD_EQUIPMENT : EQUIPMENT;
        const rec = await deps.airtable.getRecord(T.table, r);
        const fresh = (rec.fields?.[T.fields.files] || []).find((x) => x.id === a);
        if (!fresh) return fail('That file is no longer attached in Airtable.', 404);
        file = { url: fresh.url, thumb: fresh.thumbnails?.large?.url || '' };
      }
      return new Response(null, { status: 302, headers: { location: (thumb && file.thumb) || file.url, 'cache-control': 'private, max-age=600' } });
    }

    const edit = EDITS[`${req.method} ${route}`];
    if (edit) {
      if (user.role !== 'o') return fail('Sign in with the office PIN to make changes.', 403);
      try {
        const out = await edit(deps, user, await req.json().catch(() => ({})));
        if (route === 'undo') await startRefresh(deps);
        return json(out);
      } catch (e) {
        if (e instanceof EditError) return fail(e.message, e.status, e.extra);
        if (e.status === 401 || e.status === 403) return fail('Airtable refused to save. Check that AIRTABLE_TOKEN in Netlify has write access (data.records:write) to the LH Equipment base. Nothing was saved.', 502);
        if (e.status === 404) return fail('That record is no longer in Airtable. Tap Refresh.', 409);
        if (e.status === 422) return fail(`Airtable didn't accept that: ${e.message}`, 400);
        throw e;
      }
    }

    return fail('Not found.', 404);
  } catch (e) {
    if (e.status === 401 || e.status === 403 || e.status === 404) return fail('Airtable refused the request. Check that AIRTABLE_TOKEN in Netlify can read the LH Equipment base.', 502);
    deps.log?.(`Error: ${e.stack || e.message}`);
    return fail('Something went wrong on the server. Try again.', 500);
  }
}
