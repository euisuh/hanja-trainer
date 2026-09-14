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

## Mobile (Capacitor)

`android/` and `ios/` wrap the same SPA; see `docs/mobile-roadmap.md`. The app
talks to the deployed Worker at `https://hanja.uiseoya.com`, so native sign-in
needs a Worker that includes bearer tokens and Capacitor CORS.

Requirements: Node 22+, Xcode for iOS, Android Studio with JDK 21 for Android.

```sh
npm run ios       # builds with VITE_API_ORIGIN, syncs, opens Xcode
npm run android   # builds with VITE_API_ORIGIN, syncs, opens Android Studio
```

`npm run build:mobile` only builds and runs `cap sync`. Rerun it after every web
change; the native projects copy `dist/client` and do not watch it. Inspect the
WebView with Safari → Develop (iOS) or `chrome://inspect` (Android). Compile
check without signing:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug -packageAuthorizationProvider netrc CODE_SIGNING_ALLOWED=NO build
cd android && ./gradlew assembleDebug
```

From a non-interactive shell (agents, CI), keep `-packageAuthorizationProvider netrc`:
the default keychain lookup for github.com can wait forever on an invisible prompt
while Swift Package Manager downloads the Capacitor binary frameworks.

Native builds mirror pending and rejected reviews/session summaries to
Capacitor Preferences and restore missing localStorage entries before loading
the app. Existing local values win, and entries from older builds are backed
up at startup. Web builds keep localStorage only. The mirror is asynchronous:
an abrupt process kill before a write finishes, or a native storage failure,
can leave only the localStorage copy. This does not provide offline card
downloads or persist the sign-in token (tracked separately in #288).

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

For `0024_idempotent_session_summaries.sql`, merge first, then apply the
migration before deploying the dependent Worker. Its XP trigger ignores legacy
rows whose `client_session_id` is NULL, so the previous Worker's unkeyed credit
path remains compatible during rollout. Only keyed summary requests are safe
to replay.

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
`hanja.uiseoya.com` is deliberately public so it works on remote devices
without a Cloudflare login. Cloudflare Access is off, and the app does not
implement Internet account authentication. Use read-only checks from a shell
with no existing app session:

```sh
curl -s -o /dev/null -w "%{http_code}\n" https://hanja.uiseoya.com/          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://hanja.uiseoya.com/api/profiles # 200
curl -s -o /dev/null -w "%{http_code}\n" https://hanja.uiseoya.com/api/health   # 401 until a profile is selected
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
5. Only if an operator later enables Access for the audio path, set
   `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` from a service token
   authorized for `hanja.uiseoya.com/api/audio/*`. Never bypass all `/api/*`.
6. Generate and upload missing clips: `npm run audio:generate`.

Future runs of `npm run audio:generate` issue `HEAD` checks through the audio
route, which runs before profile-session middleware, and synthesize only missing
character keys. `--force` skips those checks; use it only when every selected
clip must be regenerated.

## Optional profile PIN

Each learner profile can use a four-digit PIN on unattended or shared screens.
The signed session identifies the selected learner and keeps profile data
separate. Without a PIN, anyone who can open the public hostname can select that
profile and view or change its learning data. A four-digit PIN has only 10,000
possibilities and is not strong Internet account security or protection for
copied D1 contents, so Worker-side throttling applies independently to each profile.
Activity extends a two-hour session window, while closing the browser clears
the session.

Native clients cannot use the `SameSite=Strict` cookie. They send
`x-hanja-session-transport: bearer` to `POST /api/profiles/select`,
`/api/pin/unlock`, or `/api/pin/recover` and receive the same signed token as
`sessionToken` in the JSON body, then authenticate with
`Authorization: Bearer <token>`. Bearer-authenticated responses return the
renewed token in `x-hanja-session`. Any `Authorization` header is treated as a
bearer attempt: an invalid token is rejected and never falls back to the cookie
or to the lone PIN-less profile. A cookie session is never exchanged for a
readable token, and changing a PIN rotates the secret that signs both.

The Capacitor origins `capacitor://localhost` and `https://localhost` are the
only cross-origin callers the API allows (no credentials mode). Requests from
them are bearer-only: cookies are ignored, the lone PIN-less profile is never
auto-selected, and sign-in always returns `sessionToken` in the body. Every
other origin gets no CORS headers, and cross-site browser writes stay rejected.
Audio needs no CORS because the app plays it through media elements.

The admin profile has a one-time recovery code. It is shown once, when the admin
first sets a PIN or, for an admin PIN set before recovery codes existed, after
the next successful unlock. On the admin unlock screen, "PIN을 잊으셨나요?"
accepts that code (with the same lockout as PIN attempts), clears the admin PIN
and its code, and signs in; the admin can then set a new PIN, which issues a new
code. Recovery codes exist only for the admin, and the admin cannot reset
another profile's PIN.

For a non-admin profile, or an admin whose code is lost, use an audited operator
credential reset for only the affected profile, preserving its learner tables. Rotate rather than clear `pin_secret` so existing sessions
are invalidated without making the profile unusable. The admin PIN must remain
set whenever multiple profiles exist.
