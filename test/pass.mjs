// Makes the same signed pass the Lyons & Hohl App's Equipment Tracker button makes
// (lh-app lib/equipment-pass.mjs), for the tests and the local preview.
import { createHmac } from 'node:crypto';

export function makePass(secret, { id = 'recTEST000000001', name = 'James W', role = 'o', driver = '' } = {}, now = Date.now(), seconds = 120) {
  const payload = Buffer.from(JSON.stringify({ i: id, n: name, r: role, k: driver || name, e: now + seconds * 1000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(`lh-equip.${payload}`).digest('base64url')}`;
}

// Preview people, one per level (made-up record ids).
export const PREVIEW_PEOPLE = {
  o: { id: 'recPREVIEWFULL01', name: 'James W.', role: 'o', driver: 'James W.' },
  d: { id: 'recPREVIEWDRIVE1', name: 'Jared E.', role: 'd', driver: 'Jared E.' },
  v: { id: 'recPREVIEWVIEW01', name: 'Dalton M.', role: 'v', driver: 'Dalton M.' },
};
