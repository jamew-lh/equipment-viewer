# LH Equipment Viewer

A view-only web app for the **LH Equipment** Airtable base: what's on each
jobsite, the whole fleet by type, full details and photos for every machine,
and every move since 2019. It never changes anything in Airtable. It runs on
Netlify, like the PM Service and Timecard apps.

- Everyone: `https://<your-site>/` (sign in with the viewer PIN)

---

## 1. Create a read-only Airtable token

1. Go to <https://airtable.com/create/tokens> → **Create new token**.
2. Name it `Equipment viewer`.
3. **Scopes:** add only `data.records:read`.
4. **Access:** add the **LH Equipment** base.
5. Click **Create token** and copy it. You'll paste it into Netlify in step 3.
   Don't email it or paste it anywhere else.

Because the token can only read, the app can't change your data even by mistake.

## 2. Put the code on Netlify

1. At <https://github.com>, click **New repository**. Name it `equipment-viewer`
   and make it **Private**.
2. On the new repository's page, click **uploading an existing file** and drag
   in **everything inside** the `equipment-viewer` folder (`public`, `lib`,
   `netlify`, `test`, `netlify.toml`, `package.json`, `package-lock.json`
   and the rest). Click **Commit changes**.
3. In Netlify, choose **Add new site → Import an existing project → GitHub** and
   pick `equipment-viewer`. Leave the build settings as they are and click **Deploy**.

## 3. Add the three settings in Netlify

In the new site, go to **Site configuration → Environment variables → Add a variable**:

| Key | Value |
|---|---|
| `AIRTABLE_TOKEN` | the token from step 1 |
| `SESSION_SECRET` | any long random text, at least 24 characters (use a password generator) |
| `VIEWER_PIN` | the PIN people will type to get in |

Then go to **Deploys → Trigger deploy → Deploy site** so the app picks them up.

To **change the PIN** later, edit `VIEWER_PIN` here and redeploy. Everyone is
signed out and enters the new PIN once. Otherwise people stay signed in on
their phone for 60 days.

## 4. Your own web address (optional)

In Netlify, go to **Domain management → Add a domain** and enter something like
`equipment.yourcompany.com`. Netlify shows you a **CNAME** record. In Squarespace,
go to **Settings → Domains → your domain → DNS → Add record**, choose **CNAME**,
set host `equipment` and data to the Netlify address (for example `your-site.netlify.app`).

## 5. Check it

1. Open the site and enter the PIN.
2. The very first time, it says it's getting the equipment list ready. That
   takes about 30 seconds while it reads all the moves from Airtable.
3. Open **Jobsites**, pick a site, then a machine. Check its photos open and its
   move history looks right.

On a phone, use **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home
screen** (Android) so it opens like an app.

---

## How it works

- **Where a machine is** comes from its **Location** field in Equipment Info.
  Moves are history. When the last move disagrees with Location, the machine's
  page says a move may have been missed.
- **Fresh data:** the app keeps a copy of Equipment Info, Old Equipment and
  Moves, refreshed from Airtable every 15 minutes, so pages open instantly.
  The header shows when it was last updated. **Refresh** gets changes
  right away (it takes about 20 seconds).
- **Moves are matched to machines** by Equipment ID, ignoring dashes, spaces,
  capitals and notes in brackets, so `TB20-07 (6)` and `TB20-07` match. Old
  Equipment is included, so retired machines keep their history. Moves whose ID
  isn't in either table are listed on the Moves tab under "couldn't be matched."
- **Site names** typed in Moves ("BWW", "TOA", "Culebrtson") are grouped under one
  name. If one is grouped wrong, add a line to `lib/sites.mjs` (instructions are
  at the top of that file).
- **Sold, scrapped and auctioned** pieces (Location Auction, Scrap, Trade In or
  HB Shop - TRASH, or Status Sold/Trade) are left off Jobsites and hidden in Fleet
  unless "Include sold, scrapped and old equipment" is ticked. The list is in
  `lib/config.mjs`.
- Renaming tables or fields in Airtable is safe, because the app uses Airtable's
  internal IDs. Deleting a field and making a new one with the same name is
  not: the app would need its new ID in `lib/config.mjs`.

## For a developer

- `public/`: the page (`index.html`, `app.js`, `styles.css`).
- `lib/`: the API (`app.mjs`), the Airtable reader, the 15-minute refresh
  (`sync.mjs`), and `config.mjs` with every Airtable ID.
- `netlify/functions/`: `api` for `/api/*`, `sync-background` (started when the
  copy is older than 15 minutes) and `sync-scheduled` (every 15 minutes).
- One dependency, `@netlify/blobs`, for the saved copy.
- `npm test` runs the API tests against a saved copy of the real records in
  `test/fixtures`. `npm run dev` runs a local preview at http://localhost:8890
  (PIN `2468`).
