# Words

Words is an open, local-first spaced-repetition study application inspired by the *type of learning workflow* found in Pengram, but implemented independently with its own UI, scheduling logic, storage model, and code.

The core product rule is simple: **Words does not impose product-level study quotas.** There is no daily question cap, no deck-size cap, no study-session cap, no study-history count cap, and no fixed 10-question trial. A learner can study all available cards or choose any positive session size.

## Features

- Card-by-card spaced-repetition scheduling using stability, difficulty, due time, lapses, streaks, and response time.
- Study mode that prioritizes due cards and mixes in new cards.
- Review-only mode for cards that are due now.
- Test mode that does not modify scheduling unless the learner explicitly applies the result afterward.
- Three self-ratings: Again / Hard / Good (`× / △ / ○`).
- Response time is captured when the learner reveals the answer, so time spent deciding which rating button to press does not distort scheduling.
- Immediate relearning after an incorrect answer, either by repeating the card or using a four-choice check.
- Progressive "quick reveal" mode that exposes the prompt character by character.
- Session summaries with accuracy, relearning count, and average response time.
- Custom deck creation and card editing.
- Unlimited CSV and TSV import, subject only to browser/device resources.
- XLSX workbook import with sheet selection and front/back column mapping.
- Paste-to-import workflow.
- Starter decks.
- Snapshot share links. Shared decks are copied with fresh card IDs, so the recipient's progress never collides with the source deck or another imported copy.
- JSON backup and exact restore for local learning data.
- Keyboard shortcuts with unique-key validation and configurable font size / reveal speed.
- AI import helper that creates a prompt for ChatGPT, Claude, Gemini, or another external AI to return two-column CSV. Words does not send the learner's material to those services itself.
- Offline-capable PWA service worker that caches static application assets but never caches cloud-sync API responses.
- Optional encrypted cloud sync using Cloudflare Pages Functions + D1, with stale-write conflict detection.

## No artificial learner limits

Words intentionally has **no application-defined** limit for:

- questions per day;
- questions per session;
- cards per deck;
- number of decks;
- number of study sessions;
- number of retained study-history entries;
- number of review sessions;
- number of imported CSV/TSV/XLSX rows;
- number of times the learner may retry a session.

Selecting **All** studies every card chosen by the active mode. The custom session-size field accepts any positive integer.

Real devices still have technical limits such as available RAM, browser storage quota, maximum URL length for share links, and Cloudflare/D1 plan limits if optional cloud sync is enabled. Words also uses byte-size safety ceilings when decoding untrusted compressed share links and XLSX ZIP entries to prevent decompression bombs. Those are input-safety/resource protections, not learner/card-count quotas.

## Study model

Each card records:

- next due time;
- memory stability in days;
- difficulty;
- review count;
- lapse count;
- correct streak;
- last rating;
- average response time.

`Good` increases stability and schedules the next review later. `Hard` produces a smaller increase. `Again` records a lapse and schedules a short same-day retry. Due cards are ordered by how overdue and fragile they are.

Ratings are strictly validated as `Again`, `Hard`, or `Good`; invalid or corrupted numeric values are rejected rather than silently becoming a successful review. Numeric progress loaded from storage is normalized before use.

This is an independent heuristic scheduler, not a copy of Pengram's proprietary algorithm.

## File import

### CSV / TSV

Import a file or paste delimited text. Then select:

1. the question/front column;
2. the answer/back column;
3. whether the first row is a header;
4. the deck name.

### XLSX

Words contains a small browser-side XLSX reader for ordinary Open XML workbooks. It reads the workbook, shared strings, worksheet XML, and ZIP/Deflate entries directly in the browser. Macro-enabled files and uncommon Excel features are not targeted.

The ZIP parser validates central-directory and local-entry bounds, XML parser failures, declared entry sizes, and decompressed byte counts. It applies byte-level expansion ceilings to protect the browser from malformed archives and decompression bombs. These checks do not impose a maximum number of study cards or spreadsheet rows.

## Local data and privacy

By default, all decks and learning records stay in the browser. JSON backup/restore is available from Settings.

Normal saves preserve historical study sessions, including data migrated from an older build that may have submitted only a recent history window. JSON restore and cloud restore use exact replacement semantics, so restoring a backup does not accidentally merge unrelated old sessions into it.

Shared deck links contain a compressed snapshot of a deck in the URL fragment. URL fragments are not sent to the web server as part of the HTTP request. Decoding validates the share format, deck shape, encoded characters, and decompressed byte size before accepting the deck.

## Optional cloud sync

Cloud sync is intentionally optional. The browser encrypts the complete Words backup with AES-GCM before upload.

The raw human-readable sync code and passphrase are **not** used as the server's database lookup key. Instead, the browser derives an opaque lookup key from both values using PBKDF2 and sends that derived value to the Pages Function. The encrypted backup uses its own random salt and IV. The passphrase is never sent to the sync endpoint.

Sync uses POST for both pull and push so the lookup key is not placed in the request URL. Each successful cloud write returns an update version. Later pushes must present the version they last observed; if another device changed the cloud copy first, the server returns HTTP `409` instead of silently overwriting newer data. Pull the latest cloud copy before retrying a conflicted push.

The sync endpoint also bounds request bodies while streaming them, rejects cross-site browser requests as defense in depth, and returns `Cache-Control: no-store`. The service worker explicitly excludes `/api/` responses from its offline cache.

To enable sync on Cloudflare Pages:

1. Create a D1 database.
2. Run `schema.sql` against it.
3. Bind the database to the Pages project as `WORDS_DB`.
4. Deploy this repository to Cloudflare Pages.

The function is in `functions/api/sync.js`.

Losing the passphrase makes the encrypted cloud copy unrecoverable. Cloud sync is unit-tested with a D1-compatible in-memory test double; an actual Cloudflare deployment and live D1 end-to-end test still need to be performed in the target account.

## Deployment

### Cloudflare Pages

This project is static and has no build dependency.

- Build command: leave empty, or use `npm run check`
- Build output directory: `/`

Cloudflare Pages will also deploy the optional `functions/` directory.

### Any static host

`index.html`, `app.js`, `styles.css`, `src/`, `manifest.webmanifest`, and `sw.js` can be hosted directly. Cloud sync will simply remain unavailable on hosts that do not provide the Pages Function.

## Development

Node.js 22+ is used only for tests and syntax checks.

```bash
npm test
npm run check
```

There are no runtime npm dependencies.

The current CI suite covers scheduler input validation, retry scheduling, due-card queue behavior, CSV/TSV parsing, unlimited history retention, exact backup restore, duplicate-ID repair, independent shared-deck copies, share payload validation, sync-key validation, stale-write rejection, and cross-site sync rejection.

## Project structure

```text
Words/
├─ app.js
├─ index.html
├─ styles.css
├─ manifest.webmanifest
├─ sw.js
├─ src/
│  ├─ importers.js
│  ├─ samples.js
│  ├─ scheduler.js
│  ├─ share.js
│  └─ storage.js
├─ functions/
│  └─ api/
│     └─ sync.js
├─ tests/
│  ├─ importers.test.js
│  ├─ scheduler.test.js
│  ├─ share.test.js
│  ├─ storage.test.js
│  └─ sync.test.js
├─ schema.sql
└─ .github/workflows/ci.yml
```

## Scope note

This repository recreates learning *capabilities* such as adaptive review, self-rating, quick reveal, deck import, backup, and sharing. It does not copy Pengram branding, artwork, source code, text, private datasets, or proprietary scheduling implementation.
