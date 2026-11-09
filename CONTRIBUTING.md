# Contributing

This is a solo portfolio project, but issues and pull requests are welcome.

## Setup

```sh
npm ci
npx wrangler d1 migrations apply hanja --local
npm run seed:local
npm run dev
```

See [development](docs/development.md) for local setup and checks,
[architecture](docs/architecture.md) for the Worker/SPA layout, and
[deployment](docs/deployment.md) for operations.

## Before opening a pull request

Run the same checks CI runs:

```sh
node scripts/check-docs-links.mjs
npm run lint && npm run typecheck && npm run lint:colors && npm test
npm run validate:conversation   # when data/conversation changes
npm run e2e                     # when UI or API behavior changes
```

- Branch from `main`; `main` only takes squash-merged pull requests that pass CI.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Keep the single Quiet design: no pills, gradients, monospace labels or emoji UI (`npm run lint:colors` enforces part of this).
- Korean UI text needs `word-break: keep-all` and widths in `em` or `%`; check phone width.

## Content rules

- Example sentences are real corpus rows (Tatoeba, CC BY 2.0 FR) with a verified source. Nothing machine-generated is added as a corpus sentence.
- Staff and spoken-register lines that no corpus covers may be `authored`; each needs a `reviewNote`, a Korean `cueKo` that stands alone, and stays under the caps in `docs/talk-mode.md`. Add the audio key to `data/conversation/audio-todo.json`.
- Code is MIT. Data follows each source's license; see `NOTICE`.

## Security

Do not open public issues for vulnerabilities; see `SECURITY.md`.
