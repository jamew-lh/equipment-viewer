// Local preview: the real API code against a saved copy of the LH Equipment records.
// Run `npm run dev`, open http://localhost:8890 and sign in with PIN 2468 (view only) or 1357 (office).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { handle } from '../lib/app.mjs';
import { syncNow } from '../lib/sync.mjs';
import { memoryStore } from '../lib/store.mjs';
import { fakeAirtable } from './fake-airtable.mjs';

const PORT = +process.env.PORT || 8890;
const pub = new URL('../public/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const store = memoryStore();
const airtable = fakeAirtable();
const deps = {
  env: { AIRTABLE_TOKEN: 'dev', SESSION_SECRET: 'dev-secret-dev-secret-dev-secret', VIEWER_PIN: '2468', OFFICE_PIN: '1357', TV_KEY: 'tv-preview-key' },
  airtable, store, now: () => Date.now(), ip: 'local', log: console.log,
  // Like Netlify's background function: the first load waits a few seconds.
  triggerSync: async () => { setTimeout(() => syncNow({ airtable, store, log: console.log }), 3000); },
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/') || url.pathname === '/tv') {
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? await new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); }) : undefined;
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body }), deps);
    const headers = Object.fromEntries(r.headers);
    if (headers['set-cookie']) headers['set-cookie'] = headers['set-cookie'].replace('; Secure', '');
    res.writeHead(r.status, headers);
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  if (url.pathname.startsWith('/fake-file/')) {
    const name = decodeURIComponent(url.pathname.split('/').pop());
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#d5dcda"/><text x="200" y="150" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#004745">${name.replace(/[<&]/g, '')}</text></svg>`);
  }
  const path = normalize(join(pub, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!path.startsWith(pub)) { res.writeHead(404); return res.end(); }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log(`Preview at http://localhost:${PORT} (PIN 2468)`));
