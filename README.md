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
on them. Verify the root SPA, one deep link, and `/api/health` after deploy.
Cloudflare Access is the access-control layer in front of the Worker; the app
does not implement authentication. An unauthenticated `curl` may therefore
return the Access login response even while the deployment is healthy.

### Cached reading audio

The committed curriculum produces 3,866 unique character clips: 1,000 Korean,
2,211 Japanese, and 655 Chinese.

First-time setup must deploy the audio route before generation. The generator
uses `HEAD /api/audio/...` to skip clips already stored in R2; the old API
router does not expose that route.

1. Enable R2 in the Cloudflare dashboard.
2. Create the bound bucket: `npx wrangler r2 bucket create hanja-audio`.
3. Deploy the Worker and empty audio route: `npm run deploy`.
4. Configure Google ADC with a quota project, or set
   `GOOGLE_CLOUD_ACCESS_TOKEN` and `GOOGLE_CLOUD_PROJECT`.
5. Generate and upload missing clips: `npm run audio:generate`.

Future runs of `npm run audio:generate` issue `HEAD` checks through the audio
route, which runs before device-PIN middleware, and synthesize only missing
character keys. Use `--force` only when every clip must be regenerated.

## Optional device PIN

Settings can enable a four-digit device PIN for unattended or shared screens.
This remains a local device lock, not an identity system: Cloudflare Access is
still the deployment access-control boundary. A four-digit value has only
10,000 possibilities and does not protect copied D1 contents; Worker-side
throttling protects the keyboard entry point. Unlock activity extends a
two-hour inactivity window, while closing the browser clears the session.

There is no recovery flow inside the app. An operator can remove a forgotten
PIN through D1, which also invalidates every outstanding unlock cookie:

```sh
npx wrangler d1 execute hanja --remote --command \
  "UPDATE profile SET pin_hash=NULL, pin_salt=NULL, pin_iterations=NULL, pin_secret=NULL, pin_failures=0, pin_locked_until=NULL WHERE id=1"
```
