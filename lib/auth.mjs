// PIN sign-in. The browser keeps a signed cookie that says viewer or office,
// and for the office, who. Changing VIEWER_PIN or OFFICE_PIN signs those people out.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { SESSION_DAYS } from './config.mjs';

const COOKIE = 'lhv';
const hmac = (secret, s) => createHmac('sha256', secret).update(s).digest('base64url');
const pinTag = (pin) => createHash('sha256').update(`lhv:${pin}`).digest('base64url').slice(0, 12);
const pinFor = (env, role) => (role === 'v' ? env.VIEWER_PIN : env.OFFICE_PIN || '');

export function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// role: v = viewer, p = office PIN entered but no name yet, o = office
export function makeSession(env, now, role = 'v', name = '') {
  const exp = now + SESSION_DAYS * 864e5;
  const nm = Buffer.from(name).toString('base64url');
  const sig = hmac(env.SESSION_SECRET, `v2.${exp}.${role}.${nm}.${pinTag(pinFor(env, role))}`);
  return `${COOKIE}=${exp}.${role}.${nm}.${sig}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

export const clearSession = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function session(req, env, now) {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [exp, role, nm, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || +exp < now || !['v', 'p', 'o'].includes(role)) return null;
  if (role !== 'v' && !env.OFFICE_PIN) return null;
  if (!sameText(sig, hmac(env.SESSION_SECRET, `v2.${exp}.${role}.${nm}.${pinTag(pinFor(env, role))}`))) return null;
  return { role, name: Buffer.from(nm || '', 'base64url').toString() };
}

// Shared key so only this app can start a background refresh.
export const syncKey = (env) => hmac(env.SESSION_SECRET, 'sync-background');
