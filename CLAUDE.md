# Notes for Claude (and anyone picking this up)

This file is the memory of how this app was built and why. Claude Code reads it
automatically when it is started in this folder. Keep it up to date when
something important changes. The README is the setup guide for people.

## What this is
- A web app for the Lyons & Hohl **LH Equipment** Airtable base (`appmhefV6jugAxROJ`).
  It shows what is on each jobsite, the fleet by Type, machine pages with photos and
  files, and moves since 2019. The office can also edit.
- Live at https://lh-equipment.netlify.app/. Hosted on Netlify and deployed
  automatically from GitHub `jamew-lh/equipment-viewer`, branch `main`.
  Pushing to `main` deploys.
- Owner: James W (jamesw@lyonshohl.com). The look matches the PM Service and
  Timecard apps: green `#004745`, tan `#D4A070`, white background.

## How it works
- `netlify/functions/api.mjs` serves `/api/*` and `/tv`. All routes are in `lib/app.mjs`.
- **Saved copy ("snapshot")**: Equipment Info, Old Equipment, Moves, Change Log and the
  dropdown choices are read from Airtable into one Netlify Blob (`lib/sync.mjs`,
  `lib/build.mjs`). Pages read the saved copy, not Airtable. Each copy has
  `v: SNAPSHOT_VERSION`; bump that version when the shape changes so old copies
  are re-read. Edits patch the saved copy immediately (`lib/edit.mjs`).
- Refresh: `sync-scheduled.mjs` runs every 15 minutes, except during quiet hours.
  An app visit triggers `sync-background.mjs` when the copy is more than 15 minutes old.
- **Quiet hours** (`QUIET_HOURS` in `lib/config.mjs`) are weeknights 6 PM to 4 AM
  Eastern and the weekend from Friday 6 PM to Monday 4 AM. During them there are no
  scheduled syncs, the TV doesn't trigger syncs or poll, and the TV reloads at 4 AM.
  The reason is that the Airtable Team plan allows 100k calls a month per workspace,
  and one sync costs about 56 calls (Moves is about 50 pages).
- Sign-in: a viewer PIN or an office PIN plus a name, kept in a signed cookie `lhv`
  (roles v/p/o). Each edit writes a row to the **Change Log** table. Undo is
  available for 5 minutes.
- Office can delete a move (Edit move → Delete this move, asks first). It doesn't
  change Location; Undo re-creates it as a new Airtable record.
- **Move Order** (number field on Moves, `MOVES.fields.order`, snapshot move row index 13):
  the office sets it with Arrange order on the Moves screen (drag the handle or use the
  arrows, then Save order). Scheduled and needed moves are listed in that order in the app
  and on the TV; moves with no number go after, by date. Save writes only the numbers
  that changed (10 per call) and can be undone.
- **TV screen** (NoviSign Embed widget, URL option): `/tv?key=TV_KEY`, built by
  `tvPage()` and `buildTv()` in `lib/tv.mjs`. The layout is 1920×1080, scaled to fit,
  in Eastern time from the server clock. It shows jobsites with equipment plus
  scheduled and needed moves. Seasonal looks are set in `THEMES` (by Eastern date)
  and can be overridden with `&theme=fall|halloween|normal`. Fall runs 09-22 to 10-19
  and 11-01 to 11-30. Halloween ("Spooky Jobsites") runs 10-20 to 10-31.

## Rules decided with James
- Use the **Location** field (not moves) for where a machine is.
- Only machines with **TRACKING** ticked appear. Items with no Type, and
  generators, are hidden.
- Jobsites type order: excavators, dozers, trucks, rollers, loaders, attachments,
  then trench boxes, manhole boxes, stone boxes, other items, with buckets last.
- Add move defaults to Scheduled; the buttons are ordered Scheduled, Complete, Need.
- The TV shows no past moves.
- Ignore the Category column.

## Netlify environment variables (values live only in Netlify, never in code or chat)
`AIRTABLE_TOKEN`, `SESSION_SECRET`, `VIEWER_PIN`, `OFFICE_PIN`, `TV_KEY`.
`netlify.toml` excludes the PINs and `test/**` from the secrets scan.

## Working on it
- `npm test` runs the tests against a fake Airtable built from `test/fixtures/airtable.json`.
  Run them before every push.
- `PORT=8791 npm run dev` starts a local preview. The test PINs are 2468 (viewer) and
  1357 (office), and the TV key is `tv-preview-key`. Check UI changes with Playwright
  screenshots at 1920×1080 for the TV and at phone width for the app.
- Stop a dev server with `kill $(lsof -t -i:PORT)`, not `pkill -f`.
- `[hidden]{display:none!important}` is needed because some elements set `display:flex`.
