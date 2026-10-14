// A stand-in for Airtable built from a saved copy of the real LH Equipment records.
// It takes writes too, kept in memory, so the editing routes can be tested.
import { readFileSync } from 'node:fs';

const LOCATION_CHOICES = ['Woodlands', 'HB Shop', 'hb', 'Brandywine Walk', 'Culbertson', 'cul', 'Valley Creek', 'TOA 3', 'Odessa', 'Sadsbury', 'Sads', 'Union Walk', 'Glen Ridge'];

export function fakeAirtable({ failWith, writeFailWith } = {}) {
  const data = JSON.parse(readFileSync(new URL('./fixtures/airtable.json', import.meta.url)));
  data.tbl00wX3WN9nMjgZQ ??= [];
  const calls = [];
  let n = 0;
  const err = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
  const find = (table, id) => { const r = (data[table] || []).find((x) => x.id === id); if (!r) throw err(404, 'NOT_FOUND'); return r; };
  // Airtable returns select values as names when read back.
  const store = (v) => (v === null || v === '' ? undefined : v);
  const apply = (rec, fields) => { for (const [k, v] of Object.entries(fields)) { const s = store(v); if (s === undefined || (Array.isArray(s) && !s.length)) delete rec.fields[k]; else rec.fields[k] = s; } };
  const w = () => { if (writeFailWith) throw err(writeFailWith, 'fake write failure'); };
  return {
    calls, data,
    async listAll(table, fieldIds) {
      calls.push(['list', table]);
      if (failWith) throw err(failWith, 'fake failure');
      return structuredClone(data[table] || []).map((r) => ({ ...r, fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => fieldIds.includes(k))) }));
    },
    async getRecord(table, id) { calls.push(['get', table, id]); return structuredClone(find(table, id)); },
    async create(table, list) {
      w(); calls.push(['create', table, list.length]);
      return list.map((fields) => { const rec = { id: `recNEW${String(++n).padStart(11, '0')}`, fields: {} }; apply(rec, fields); (data[table] ??= []).push(rec); return structuredClone(rec); });
    },
    async update(table, id, fields) {
      w(); calls.push(['update', table, id, Object.keys(fields)]); const rec = find(table, id);
      // Attachments sent as [{id}] keep only those files.
      const before = structuredClone(rec.fields);
      apply(rec, fields);
      for (const [k, v] of Object.entries(fields)) if (Array.isArray(v) && (!v.length || (v[0]?.id && !v[0].filename)) && Array.isArray(before[k]) && before[k][0]?.filename) {
        const keep = (before[k] || []).filter((a) => v.some((x) => x.id === a.id)); if (keep.length) rec.fields[k] = keep; else delete rec.fields[k];
      }
      return structuredClone(rec);
    },
    async destroy(table, ids) { w(); calls.push(['delete', table, ids]); data[table] = data[table].filter((r) => !ids.includes(r.id)); },
    async upload(id, fieldId, { contentType, filename }) {
      w(); calls.push(['upload', id, filename]);
      const rec = find('tblHqR9T4pGezce4B', id);
      const a = { id: `attNEW${String(++n).padStart(11, '0')}`, filename, type: contentType, url: `/fake-file/new/${filename}` };
      rec.fields[fieldId] = [...(rec.fields[fieldId] || []), a];
      return structuredClone(rec);
    },
    async meta() {
      return { tables: [{ id: 'tblHqR9T4pGezce4B', fields: [
        { id: 'flduZshwr22R9gIjX', options: { choices: LOCATION_CHOICES.map((name) => ({ name })) } },
        { id: 'fldd4ONpETk0OYN2J', options: { choices: ['In Service', 'Down for Maintenance', 'Out of Service', 'Sold/Trade'].map((name) => ({ name })) } },
      ] }] };
    },
  };
}
