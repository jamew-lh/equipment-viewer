// Sign-in comes from the Lyons & Hohl App. People sign in there with their last name and
// Timecard Pin; its Equipment Tracker button sends them here with a short-lived signed pass
// (/api/sso?t=...). The pass says who they are and their level from the Employee List's
// "Equipment Tracker" field:
//   v = View Only, d = Driver User (can mark their own moves done), o = Full Edit.
// Both sites share LH_HANDOFF_SECRET. This app then keeps its own signed cookie for
// SESSION_HOURS; after that the next tap in the Lyons & Hohl App picks up any change.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SESSION_HOURS } from './config.mjs';

const COOKIE = 'lhe';
const ROLES = ['v', 'd', 'o'];
const hmac = (secret, s) => createHmac('sha256', secret).update(s).digest('base64url');
const b64 = (s) => Buffer.from(String(s ?? '')).toString('base64url');
const unb64 = (s) => Buffer.from(String(s || ''), 'base64url').toString();

export function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Letters only, lower case: "Jared E." on the employee record matches "Jared E" on a move.
export const sameDriver = (a, b) => {
  const k = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  return !!k(a) && k(a) === k(b);
};

// The pass from the Lyons & Hohl App. Returns { id, name, role, driver } or null.
export function readPass(env, token, now) {
  const secret = String(env.LH_HANDOFF_SECRET || '');
  const [payload, sig] = String(token || '').split('.');
  if (secret.length < 24 || !payload || !sig || !sameText(sig, hmac(secret, `lh-equip.${payload}`))) return null;
  let p; try { p = JSON.parse(unb64(payload)); } catch { return null; }
  if (!p || !(p.e > now) || p.e > now + 10 * 60e3 || !ROLES.includes(p.r) || !p.i || !String(p.n || '').trim()) return null;
  return { id: String(p.i), name: String(p.n).trim().slice(0, 40), role: p.r, driver: String(p.k || '').trim().slice(0, 40) };
}

export function makeSession(env, now, u) {
  const exp = now + SESSION_HOURS * 3600e3;
  const body = [exp, u.role, b64(u.id), b64(u.name), b64(u.driver)].join('.');
  return `${COOKIE}=${body}.${hmac(env.SESSION_SECRET, `v3.${body}`)}; Path=/; Max-Age=${SESSION_HOURS * 3600}; HttpOnly; Secure; SameSite=Lax`;
}

export const clearSession = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function session(req, env, now) {
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const parts = raw.slice(COOKIE.length + 1).split('.');
  if (parts.length !== 6) return null;
  const [exp, role, id, name, driver, sig] = parts;
  if (!(+exp > now) || !ROLES.includes(role)) return null;
  if (!sameText(sig, hmac(env.SESSION_SECRET, `v3.${parts.slice(0, 5).join('.')}`))) return null;
  return { role, id: unb64(id), name: unb64(name), driver: unb64(driver) };
}

// Shared key so only this app can start a background refresh.
export const syncKey = (env) => hmac(env.SESSION_SECRET, 'sync-background');
