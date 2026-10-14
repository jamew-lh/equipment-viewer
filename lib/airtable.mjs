// Read-only Airtable client. Pages through tables at a pace Airtable allows
// (5 requests a second per base) and waits out a rate-limit reply.
const API = 'https://api.airtable.com/v0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AirtableError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function makeAirtable({ token, baseId, fetchImpl = fetch, pauseMs = 220 }) {
  async function get(path, params) {
    const url = `${API}/${baseId}/${path}${params ? `?${params}` : ''}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429 && attempt < 2) { await sleep(31000); continue; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new AirtableError(res.status, body?.error?.message || body?.error?.type || body?.error || `HTTP ${res.status}`);
      return body;
    }
  }
  return {
    async listAll(table, fieldIds) {
      const out = [];
      let offset;
      do {
        const p = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' });
        for (const f of fieldIds) p.append('fields[]', f);
        if (offset) p.set('offset', offset);
        const body = await get(encodeURIComponent(table), p.toString());
        out.push(...(body.records || []));
        offset = body.offset;
        if (offset) await sleep(pauseMs);
      } while (offset);
      return out;
    },
    async getRecord(table, id) {
      return get(`${encodeURIComponent(table)}/${encodeURIComponent(id)}`, 'returnFieldsByFieldId=true');
    },
  };
}
