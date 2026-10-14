// Where the saved copy of Airtable lives: Netlify Blobs on Netlify,
// memory everywhere else (tests and the local preview).
import { getStore } from '@netlify/blobs';

export function memoryStore() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async set(k, v) { m.set(k, JSON.stringify(v)); },
  };
}

function blobStore() {
  const s = getStore({ name: 'lh-equipment-viewer', consistency: 'strong' });
  return {
    async get(k) { return s.get(k, { type: 'json' }); },
    async set(k, v) { await s.setJSON(k, v); },
  };
}

let fallback = null;
export function openStore() {
  try {
    return blobStore();
  } catch {
    fallback ||= memoryStore();
    return fallback;
  }
}
