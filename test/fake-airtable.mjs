// A stand-in for Airtable built from a saved copy of the real LH Equipment records.
import { readFileSync } from 'node:fs';

export function fakeAirtable({ failWith } = {}) {
  const data = JSON.parse(readFileSync(new URL('./fixtures/airtable.json', import.meta.url)));
  const calls = [];
  return {
    calls,
    async listAll(table, fieldIds) {
      calls.push(['list', table]);
      if (failWith) { const e = new Error('fake failure'); e.status = failWith; throw e; }
      return structuredClone(data[table] || []).map((r) => ({ ...r, fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => fieldIds.includes(k))) }));
    },
    async getRecord(table, id) {
      calls.push(['get', table, id]);
      const r = (data[table] || []).find((x) => x.id === id);
      if (!r) { const e = new Error('NOT_FOUND'); e.status = 404; throw e; }
      return structuredClone(r);
    },
  };
}
