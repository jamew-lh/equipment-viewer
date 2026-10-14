// Background function: reads all of Equipment Info, Old Equipment and Moves
// (about 15 seconds) and saves the copy the app shows. Started by /api when the copy is old.
import { syncNow } from '../../lib/sync.mjs';
import { makeAirtable } from '../../lib/airtable.mjs';
import { openStore } from '../../lib/store.mjs';
import { syncKey, sameText } from '../../lib/auth.mjs';
import { BASE_ID } from '../../lib/config.mjs';

export default async (req) => {
  const env = { AIRTABLE_TOKEN: Netlify.env.get('AIRTABLE_TOKEN'), SESSION_SECRET: Netlify.env.get('SESSION_SECRET') };
  if (!env.SESSION_SECRET || !sameText(req.headers.get('x-sync-key') || '', syncKey(env))) return;
  await syncNow({ airtable: makeAirtable({ token: env.AIRTABLE_TOKEN, baseId: BASE_ID }), store: openStore(), log: (m) => console.log(m) })
    .catch((e) => console.log(`Refresh failed: ${e.message}`));
};
