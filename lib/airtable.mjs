// Airtable client. Reads page through tables at a pace Airtable allows
// (5 requests a second per base) and wait out a rate-limit reply.
// Writes are used only by the office editing routes.
const API = 'https://api.airtable.com/v0';
const CONTENT = 'https://content.airtable.com/v0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AirtableError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function makeAirtable({ token, baseId, fetchImpl = fetch, pauseMs = 220 }) {
  async function call(url, { method = 'GET', body } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 && attempt < 2) { await sleep(31000); continue; }
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new AirtableError(res.status, out?.error?.message || out?.error?.type || out?.error || `HTTP ${res.status}`);
      return out;
    }
  }
  const tableUrl = (table) => `${API}/${baseId}/${encodeURIComponent(table)}`;
  const q = 'returnFieldsByFieldId=true';
  return {
    async listAll(table, fieldIds) {
      const out = [];
      let offset;
      do {
        const p = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' });
        for (const f of fieldIds) p.append('fields[]', f);
        if (offset) p.set('offset', offset);
        const body = await call(`${tableUrl(table)}?${p}`);
        out.push(...(body.records || []));
        offset = body.offset;
        if (offset) await sleep(pauseMs);
      } while (offset);
      return out;
    },
    getRecord: (table, id) => call(`${tableUrl(table)}/${encodeURIComponent(id)}?${q}`),
    // fields are keyed by field ID. typecast lets a new site or status be added to a dropdown.
    async create(table, fieldsList) {
      const out = [];
      for (let i = 0; i < fieldsList.length; i += 10) {
        const b = await call(`${tableUrl(table)}`, { method: 'POST', body: { records: fieldsList.slice(i, i + 10).map((fields) => ({ fields })), typecast: true, returnFieldsByFieldId: true } });
        out.push(...b.records);
      }
      return out;
    },
    update: (table, id, fields) =>
      call(`${tableUrl(table)}/${encodeURIComponent(id)}`, { method: 'PATCH', body: { fields, typecast: true, returnFieldsByFieldId: true } }),
    async destroy(table, ids) {
      for (let i = 0; i < ids.length; i += 10) {
        const p = new URLSearchParams(); ids.slice(i, i + 10).forEach((id) => p.append('records[]', id));
        await call(`${tableUrl(table)}?${p}`, { method: 'DELETE' });
      }
    },
    // Adds one file (base64, up to 5 MB) to an attachment field.
    upload: (recordId, fieldId, { contentType, filename, file }) =>
      call(`${CONTENT}/${baseId}/${encodeURIComponent(recordId)}/${fieldId}/uploadAttachment`, { method: 'POST', body: { contentType, filename, file } }),
    // Dropdown choices for the edit forms. Needs the token's schema.bases:read scope.
    meta: () => call(`${API}/meta/bases/${baseId}/tables`),
  };
}
