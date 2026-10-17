# LH Equipment Viewer

A web app for the **LH Equipment** Airtable base: what's on each jobsite, the
whole fleet by type, full details and photos for every machine, and every move
since 2019. It runs on Netlify, like the PM Service and Timecard apps.

- **Viewers** sign in with the viewer PIN and can only look.
- **The office** signs in with the office PIN and their name, and can add moves,
  mark scheduled moves done, edit machine details, add photos and PDFs, and add
  machines. Every change goes straight to Airtable and is recorded in the
  **Change Log** table with who made it.

---

## 1. Create the Airtable token

1. Go to <https://airtable.com/create/tokens> → **Create new token**
   (or open the existing `Equipment viewer` token and edit it).
2. **Scopes:** `data.records:read`, `data.records:write` and `schema.bases:read`.
   The last one lets the edit forms show your Airtable dropdown lists.
3. **Access:** add the **LH Equipment** base.
4. Save, and copy the token if it's new. You'll paste it into Netlify in step 3.
   Don't email it or paste it anywhere else.

The app only writes to **Equipment Info** (machine details, Location, photos),
**Moves** (new moves, marking moves done) and **Change Log**. It never deletes
anything except to undo a change in the first 5 minutes.

## 2. Put the code on Netlify

1. At <https://github.com>, click **New repository**. Name it `equipment-viewer`
   and make it **Private**.
2. On the new repository's page, click **uploading an existing file** and drag
   in **everything inside** the `equipment-viewer` folder (`public`, `lib`,
   `netlify`, `test`, `netlify.toml`, `package.json`, `package-lock.json`
   and the rest). Click **Commit changes**.
3. In Netlify, choose **Add new site → Import an existing project → GitHub** and
   pick `equipment-viewer`. Leave the build settings as they are and click **Deploy**.

## 3. Add the settings in Netlify

In the new site, go to **Site configuration → Environment variables → Add a variable**:

| Key | Value |
|---|---|
| `AIRTABLE_TOKEN` | the token from step 1 |
| `SESSION_SECRET` | any long random text, at least 24 characters (use a password generator) |
| `VIEWER_PIN` | the PIN people will type to look around |
| `OFFICE_PIN` | a different PIN, for the office only. Make it longer than the viewer PIN |

Then go to **Deploys → Trigger deploy → Deploy site** so the app picks them up.

To **change a PIN** later, edit `VIEWER_PIN` or `OFFICE_PIN` here and redeploy.
People using that PIN are signed out and enter the new one once. Otherwise
people stay signed in on their phone for 60 days. Without `OFFICE_PIN`, the app
is view-only for everyone.

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

## Office editing

- **Add move:** the green **+ Add move** button, or the one on a machine page.
  Pick the machine from the list, pick where it went, and save. A **Complete**
  move also sets the machine's **Location**. A **Scheduled** or **Need** move
  leaves Location alone until someone taps **Mark done** (Moves tab, or the
  machine's history).
- **Edit details** on a machine page. Changing Location offers to log it as a move.
- **Edit** on any move (machine history, jobsite pages, or the Moves table) to fix
  its machine, sites, date, status, driver, truck or permit. When it's the
  machine's latest move, it offers to change the machine's Location to match.
  Moves that don't match a machine can be linked by picking the right one.
- **+ Add photo or file** on a machine page. Phone photos are shrunk to fit
  Airtable's 5 MB limit. PDFs are added as they are.
- **+ Add machine** under Fleet. The Equipment ID must be new, and a Type is required.
- **Undo** appears after every save, for 5 minutes. After that, change it back
  with Edit, or in Airtable.
- **Someone else's change is never overwritten.** If a field changed in Airtable
  after you opened the form, the save is refused and asks you to refresh.
- Each machine page lists **Changes made in the app**, from the Change Log table.
- New moves get **Entered By** filled in, and their Moves **Type** set from the
  machine when your Moves Type list has a match.

## Office TV screen (NoviSign)

`https://<your-site>/tv?key=<TV_KEY>` shows every jobsite and its equipment,
plus scheduled and needed moves, on one 16:9 screen. It's
laid out at 1920 x 1080 and scales to fit any screen size.

- **Turn it on:** in Netlify, add an environment variable `TV_KEY` set to a long
  random string (a password generator's 32 characters, letters and numbers), then
  redeploy. The key in the link is the screen's password, since a signage player
  can't type a PIN. To shut off an old link, change `TV_KEY` and redeploy.
- **NoviSign:** in Studio, make a creative at 1920 x 1080 (landscape), drag an
  **Embed** widget over the whole canvas, choose **URL**, and paste the link.
  Leave the widget's reload/refresh off: the page refreshes its own data every
  minute and reloads itself once a night at 3 AM.
- **What it shows:** the same pieces as Jobsites (not sold, scrapped, auctioned,
  no Type, or generators), grouped by type in the Jobsites order, with buckets
  last. Down for maintenance is red. Changes made in the app show up within a
  minute; changes made directly in Airtable within about 15 minutes.
- If the screen loses internet it keeps showing the last data and says so in the
  top right corner.

## How it works

- **Where a machine is** comes from its **Location** field in Equipment Info.
  Moves are history. When the last move disagrees with Location, the machine's
  page says a move may have been missed.
- **Fresh data:** the app keeps a copy of Equipment Info, Old Equipment, Moves
  and the Change Log, refreshed from Airtable every 15 minutes, so pages open
  instantly. Changes made in the app show up for everyone right away; changes
  made directly in Airtable show up within 15 minutes.
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
- `lib/`: the API (`app.mjs`), office editing (`edit.mjs`), the Airtable
  client, the 15-minute refresh (`sync.mjs`), and `config.mjs` with every
  Airtable ID.
- `public/edit.js`: the office forms. Viewers load it too but never see them.
- `netlify/functions/`: `api` for `/api/*`, `sync-background` (started when the
  copy is older than 15 minutes) and `sync-scheduled` (every 15 minutes).
- One dependency, `@netlify/blobs`, for the saved copy.
- `npm test` runs the API tests against a saved copy of the real records in
  `test/fixtures`. `npm run dev` runs a local preview at http://localhost:8890
  (PIN `2468` to look, `1357` for the office). Saves go to an in-memory copy.
