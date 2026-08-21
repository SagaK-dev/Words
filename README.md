# Words

Words is an open, local-first spaced-repetition study application inspired by the *type of learning workflow* found in Pengram, but implemented independently with its own UI, scheduling logic, storage model, and code.

The core product rule is simple: **Words does not impose product-level study quotas.** There is no daily question cap, no deck-size cap, no study-session cap, and no fixed 10-question trial. A learner can study all available cards or choose any positive session size.

## Features

- Card-by-card spaced-repetition scheduling using stability, difficulty, due time, lapses, streaks, and response time.
- Study mode that prioritizes due cards and mixes in new cards.
- Review-only mode for cards that are due now.
- Test mode that does not modify scheduling unless the learner explicitly applies the result afterward.
- Three self-ratings: Again / Hard / Good (`× / △ / ○`).
- Immediate relearning after an incorrect answer, either by repeating the card or using a four-choice check.
- Progressive "quick reveal" mode that exposes the prompt character by character.
- Session summaries with accuracy, relearning count, and average response time.
- Custom deck creation and card editing.
- Unlimited CSV and TSV import, subject only to browser/device memory.
- XLSX workbook import with sheet selection and front/back column mapping.
- Paste-to-import workflow.
- Starter decks.
- Snapshot share links. Shared decks are copied, so later edits do not mutate recipients' copies.
- JSON backup and restore for all local learning data.
- Keyboard shortcuts and configurable font size / reveal speed.
- AI import helper that creates a prompt for ChatGPT, Claude, Gemini, or another external AI to return two-column CSV. Words does not send the learner's material to those services itself.
- Offline-capable PWA service worker.
- Optional encrypted cloud sync using Cloudflare Pages Functions + D1.

## No artificial learner limits

Words intentionally has **no application-defined** limit for:

- questions per day;
- questions per session;
- cards per deck;
- number of decks;
- number of study sessions;
- number of review sessions;
- number of imported CSV/TSV/XLSX rows;
- number of times the learner may retry a session.

Selecting **All** studies every card chosen by the active mode. The custom session-size field accepts any positive integer.

Real devices still have technical limits such as available RAM, browser storage quota, maximum URL length for share links, and Cloudflare/D1 plan limits if optional cloud sync is enabled. Those are infrastructure constraints rather than artificial limits in Words.

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

## Local data and privacy

By default, all decks and learning records stay in the browser. JSON backup/restore is available from Settings.

Shared deck links contain a compressed snapshot of a deck in the URL fragment. URL fragments are not sent to the web server as part of the HTTP request.

## Optional cloud sync

Cloud sync is intentionally optional. The browser encrypts the complete Words backup with AES-GCM before upload. The server stores only ciphertext under a user-chosen sync code.

To enable sync on Cloudflare Pages:

1. Create a D1 database.
2. Run `schema.sql` against it.
3. Bind the database to the Pages project as `WORDS_DB`.
4. Deploy this repository to Cloudflare Pages.

The function is in `functions/api/sync.js`.

The passphrase never needs to be sent to the sync endpoint. Losing it makes the encrypted cloud copy unrecoverable.

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
│  └─ storage.test.js
├─ schema.sql
└─ .github/workflows/ci.yml
```

## Scope note

This repository recreates learning *capabilities* such as adaptive review, self-rating, quick reveal, deck import, backup, and sharing. It does not copy Pengram branding, artwork, source code, text, private datasets, or proprietary scheduling implementation.
