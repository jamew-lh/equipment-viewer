// Keeps the saved copy fresh every 15 minutes, except overnight (QUIET_HOURS in lib/config.mjs).
import { syncNow } from '../../lib/sync.mjs';
import { makeAirtable } from '../../lib/airtable.mjs';
import { openStore } from '../../lib/store.mjs';
import { BASE_ID, inQuietHours } from '../../lib/config.mjs';

export default async () => {
  const token = Netlify.env.get('AIRTABLE_TOKEN');
  if (!token) return;
  if (inQuietHours(Date.now())) return; // overnight: no Airtable calls
  await syncNow({ airtable: makeAirtable({ token, baseId: BASE_ID }), store: openStore(), log: (m) => console.log(m) })
    .catch((e) => console.log(`Refresh failed: ${e.message}`));
};

export const config = { schedule: '*/15 * * * *' };
