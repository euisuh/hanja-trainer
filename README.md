# Hanja Trainer

Duolingo-style spaced-repetition trainer for Chinese-origin characters,
taught across three tracks at once: Korean Hanja (한자능력검정), Japanese
Kanji (JLPT/漢検), Chinese Hanzi (HSK/通用规范汉字表). Same character, same
core meaning, three pronunciations — reinforced side by side.

- `design-prompt.md` — product/UX spec handed to Claude Design.
- `design/Hanja Trainer.dc.html` + `design/support.js` — the resulting
  wireframe (Claude Design canvas export). Reference for screen layout and
  interaction only — **not** the app's runtime; the real app does not use
  the `x-dc`/`sc-if`/`sc-for` template DSL from `support.js`.

Solo single-user product. Keyboard-first (1-4 answer, Enter advance, Esc
pause, no mouse-required flow), mobile-responsive. FSRS-scheduled reviews.
Real corpus/textbook example sentences only, no AI-generated content.

## Development

```sh
npm install
npx wrangler d1 migrations apply hanja --local
npm run seed:local
npm run dev
```

`npm run dev` builds the SPA, then starts `wrangler dev`. The SPA and API share
one origin; verify the Worker with `curl http://localhost:8787/api/health`.

## Checks and build

```sh
npm run typecheck
npm run lint
npm run lint:colors
npm test
npx playwright install chromium
npm run e2e
npm run build
npx wrangler deploy --dry-run
```

The Playwright suite resets the local profile and learning history, reseeds the
local D1 database, and drives all happy paths with keyboard events. Responsive
screenshots are written under `test-results/`.

## D1 migrations

```sh
npx wrangler d1 migrations apply hanja --local
npm run seed:local
```

The seed is idempotent and loads all checked-in character, curriculum, and
sentence datasets.

Migration files are append-only once they reach a shared environment. Never
edit, delete, or rename one; add the next numbered migration for every fix.
For structural changes, test both a fresh database and an upgrade from the
previous schema with representative learner rows.

CI compares pull requests with `main`, so it cannot detect a migration applied
remotely before it was merged. Do not apply production migrations before
merge. If an emergency requires it, record the exact filename and contents,
and put any correction in another new file even while the pull request is open.

## D1 query diagnostics

When Cloudflare D1 analytics reports an expensive query, identify the exact SQL
and bindings, then inspect that statement with `EXPLAIN QUERY PLAN` in a local,
throwaway database. The curriculum lookup's `cum` step should use the
character-first covering index `idx_curriculum_unit_members_character`.
Compare `meta.rows_read` and `meta.rows_written` from real D1 responses before
and after the change under equivalent inputs. Test adapters return constant-zero
metadata, and local SQLite plans show structure rather than billed production
rows; neither is a production cost measurement.

## Offline review times

Queued reviews retain the instant the learner answered, so delayed sync keeps
the original history day and schedules from that event. A late event older than
the current FSRS state is applied to that current state without moving
`last_review` backward; history still records the original answer time rather
than rebuilding later events. Legacy queued reviews without an answer time use
receipt time. The server rejects timestamps over five minutes in the future and
clamps smaller clock skew to receipt time.

## Deploy

```sh
npx wrangler whoami
npx wrangler d1 migrations apply hanja --remote
npm run seed:remote
npm run deploy
curl -i https://hanja.uiseoya.com/api/health
curl -i https://hanja.uiseoya.com/detail/%E4%B8%80
```

Run remote migrations and the seed before deploying Worker code that depends
on them. Only apply reviewed, merged migrations. Before deploying dependent
Worker code, verify the expected remote schema with read-only checks such as
`PRAGMA table_info(table_name)` or a query of `sqlite_schema`. Then verify the
root SPA, one deep link, and `/api/health` after deploy.
The `Hanja Trainer` Cloudflare Access application protects the entire
`hanja.uiseoya.com` hostname for 24 hours and allows only the operator email.
The app does not implement account authentication. Verify the boundary from a
shell with no Access session; each command must return a redirect or Access
HTML, never application JSON:

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://hanja.uiseoya.com/
curl -s https://hanja.uiseoya.com/api/profiles
curl -s -X POST https://hanja.uiseoya.com/api/profiles/select \
  -H 'content-type: application/json' -d '{"profileId":2}'
```

### Cached reading audio

The committed curriculum produces 3,866 unique character clips: 1,000 Korean,
2,211 Japanese, and 655 Chinese. `npm run audio:generate` also generates 503
unique example-sentence clips for the speaking screen (236 Japanese, 267
Chinese, keyed by Tatoeba sentence id) — Korean has no speaking screen and
is skipped.

First-time setup must deploy the audio route before generation. The generator
uses `HEAD /api/audio/...` to skip clips already stored in R2; the old API
router does not expose that route.

1. Enable R2 in the Cloudflare dashboard.
2. Create the bound bucket: `npx wrangler r2 bucket create hanja-audio`.
3. Deploy the Worker and empty audio route: `npm run deploy`.
4. Configure Google ADC with a quota project, or set
   `GOOGLE_CLOUD_ACCESS_TOKEN` and `GOOGLE_CLOUD_PROJECT`.
5. For cached-clip checks through Access, set `CF_ACCESS_CLIENT_ID` and
   `CF_ACCESS_CLIENT_SECRET` from a service token authorized for
   `hanja.uiseoya.com/api/audio/*`. Never bypass the whole `/api/*` path.
6. Generate and upload missing clips: `npm run audio:generate`.

Future runs of `npm run audio:generate` issue `HEAD` checks through the audio
route, which runs before profile-session middleware, and synthesize only missing
character keys. `--force` skips those checks and therefore does not need the
Access service token; use it only when every selected clip must be regenerated.

## Optional profile PIN

Each learner profile can use a four-digit PIN on unattended or shared screens.
The signed session identifies the selected learner and keeps profile data
separate; Cloudflare Access remains the deployment access-control boundary. A
four-digit value has only 10,000 possibilities and does not protect copied D1
contents, so Worker-side throttling applies independently to each profile.
Activity extends a two-hour session window, while closing the browser clears
the session.

There is no recovery flow inside the app. Recover a forgotten PIN through an
audited operator credential reset for only the affected profile, preserving
its learner tables. Rotate rather than clear `pin_secret` so existing sessions
are invalidated without making the profile unusable. The admin PIN must remain
set whenever multiple profiles exist.
