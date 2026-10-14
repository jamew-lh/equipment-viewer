// Netlify entry point for /api/*.
import { handle } from '../../lib/app.mjs';
import { makeAirtable } from '../../lib/airtable.mjs';
import { openStore } from '../../lib/store.mjs';
import { syncKey } from '../../lib/auth.mjs';
import { BASE_ID } from '../../lib/config.mjs';

export default async (req, context) => {
  const env = {
    AIRTABLE_TOKEN: Netlify.env.get('AIRTABLE_TOKEN'),
    SESSION_SECRET: Netlify.env.get('SESSION_SECRET'),
    VIEWER_PIN: Netlify.env.get('VIEWER_PIN'),
    OFFICE_PIN: Netlify.env.get('OFFICE_PIN'),
  };
  return handle(req, {
    env,
    airtable: makeAirtable({ token: env.AIRTABLE_TOKEN, baseId: BASE_ID }),
    store: openStore(),
    now: () => Date.now(),
    ip: context.ip,
    log: (m) => console.log(m),
    // Hands the slow Airtable read to the background function, which can run for minutes.
    triggerSync: async () => {
      const res = await fetch(new URL('/.netlify/functions/sync-background', req.url), {
        method: 'POST', headers: { 'x-sync-key': syncKey(env) },
      });
      if (res.status >= 400) throw new Error(`background refresh returned ${res.status}`);
    },
  });
};

export const config = { path: '/api/*' };
