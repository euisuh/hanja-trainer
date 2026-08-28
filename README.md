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
npm run dev
```

`npm run dev` builds the SPA, then starts `wrangler dev`. The SPA and API share
one origin; verify the Worker with `curl http://localhost:8787/api/health`.

## Checks and build

```sh
npm run typecheck
npm run lint
npm run build
npx wrangler deploy --dry-run
```

## D1 migrations

Issue #3 adds the first migration. Apply migrations locally or remotely with:

```sh
npx wrangler d1 migrations apply hanja-trainer --local
npx wrangler d1 migrations apply hanja-trainer --remote
```

## Deploy

Replace the placeholder D1 `database_id` in `wrangler.jsonc` with the deployed
database ID, then run:

```sh
npm run deploy
```
