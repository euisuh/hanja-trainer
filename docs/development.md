# Development

[Documentation index](README.md)

## Local setup

Use Node 22 (the CI version) and npm. Run commands from the repository root.

```sh
npm install
npx wrangler d1 migrations apply hanja --local
npm run seed:local
npm run dev
```

`npm run dev` builds the SPA, then starts `wrangler dev`. The SPA and API share
one origin; verify the Worker with `curl http://localhost:8787/api/health`.

### Profile list privacy and guest accounts

`GET /api/profiles` returns real profile names only to a caller that holds a
real session, carries the `hanja_device` cookie (set by a successful PIN unlock
or recovery in that browser, 400 days, rotated with the PIN), or when the only
profile has no PIN. Everyone else, guests included, gets one nameless
admin entry (`관리자`) so the owner can still unlock on a new device; family
members on a new device appear after the admin unlocks there once. Native
clients get no device cookie, so after their token expires they also see only
the admin entry. The same trust (real session, device cookie, or the flag
below) is required to select a PIN-less non-admin profile, so a hidden profile
cannot be entered by guessing its id (`403 device_not_trusted`).

The lone PIN-less profile still signs in automatically without a device
cookie. That setup is public by design (see [optional profile PIN](deployment.md#optional-profile-pin)): nothing
else exists to protect, and gating it would lock a PIN-less owner out with no
way to earn the cookie. Set an admin PIN before exposing the site. A rejected
session cookie never falls back to it unless the cookie was for that same
profile, so an expired guest cookie gets `401` and is cleared.

To list every profile anonymously, as before, start the Worker
with `--var ALLOW_PROFILE_LIST:true` (e2e does) or set it in `vars`; it defaults
to off.

Visitors can continue as a guest: "Continue as guest" on the landing page, the
"게스트" tile in the profile picker, or "게스트로 둘러보기" on the unlock screen.
Each calls `POST /api/demo/session`. Every guest gets a private profile named
`게스트` (`is_demo = 1`, no PIN, onboarded, Japanese track only). Guests never
share an account, never see each other, and never see real profiles.

- A guest session lasts 7 days after the last activity, and never more than
  30 days after creation. Every guest request atomically checks and moves the
  server-owned `demo_active_at` (migration 0034, written only from the Worker
  clock, never from client data or `updated_at`) and renews the cookie to
  expire at the same moment. An expired guest is rejected and then deleted,
  with its data, by the next guest create.
- Calling the endpoint again from a browser that still holds a valid guest
  session resumes that same profile and its progress; otherwise it creates a
  new one.
- Limits: 5 creates per client IP per hour (hashed `CF-Connecting-IP`), 200
  live guest profiles, 2,000 writes per guest profile.
- Guests cannot change a PIN, manage profiles, or be selected by id. Guest rows
  do not count toward the five-profile limit. Settings shows guests a notice
  that progress stays on this browser for 7 days, with a link to sign in, which
  ends the guest session.

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

## Tests

`npm test` runs the Node script tests and Vitest suites. `npm run e2e` runs
Playwright against local D1; it resets local learner data as described above.
Run `node scripts/check-docs-links.mjs` for documentation links.

## Screenshot fixtures

The stats screens use made-up study history for the local guest profile, inserted into local D1 by the script as a fixture.

To regenerate: start the local dev server with an admin PIN set (the landing page
only shows then), run `node scripts/capture-readme-screenshots.mjs`; usage is in
the script header. Local D1 only; the microphone and speech recognition are
stubbed so the shadowing panel can be captured headlessly.

## Architecture

- `src/` is the SPA; `worker/` is the Worker API; `shared/` holds types used by both.
- The SPA and API share one origin. `npm run dev` builds the SPA, then runs `wrangler dev`.
- Learner state (reviews, FSRS cards, session summaries) lives in D1; `migrations/` is append-only.
- Character, curriculum and sentence datasets are checked in under `data/` and loaded by an idempotent seed script.
- Reading audio is generated offline and cached in R2.
- Queued offline reviews keep the answer timestamp so delayed sync schedules from the original event.
- The native apps load the same SPA and call the deployed Worker with bearer tokens.
- Product spec: `design-prompt.md`; wireframe reference: `design/`.

## Licenses and data sources

Code is MIT ([LICENSE](../LICENSE)). Data keeps its source licenses: see [NOTICE](../NOTICE) and
[data/SOURCES.md](../data/SOURCES.md).

