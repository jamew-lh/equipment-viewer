// PIN sign-in. The browser keeps a signed cookie; changing VIEWER_PIN signs everyone out.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { SESSION_DAYS } from './config.mjs';

const COOKIE = 'lhv';
const hmac = (secret, s) => createHmac('sha256', secret).update(s).digest('base64url');
const pinTag = (pin) => createHash('sha256').update(`lhv:${pin}`).digest('base64url').slice(0, 12);

export function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function makeSession(env, now) {
  const exp = now + SESSION_DAYS * 864e5;
  const sig = hmac(env.SESSION_SECRET, `v1.${exp}.${pinTag(env.VIEWER_PIN)}`);
  return `${COOKIE}=${exp}.${sig}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}

export const clearSession = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function isSignedIn(req, env, now) {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || +exp < now) return false;
  return sameText(sig, hmac(env.SESSION_SECRET, `v1.${exp}.${pinTag(env.VIEWER_PIN)}`));
}

// Shared key so only this app can start a background refresh.
export const syncKey = (env) => hmac(env.SESSION_SECRET, 'sync-background');
