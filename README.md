# Hanja Trainer

Duolingo-style spaced-repetition trainer for Chinese-origin characters,
taught across three tracks at once: Korean Hanja (한자능력검정), Japanese
Kanji (漢検/JLPT), Chinese Hanzi (HSK/通用规范汉字表). Same character, same
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
