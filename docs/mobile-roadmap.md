# Android and iOS roadmap

Tracking epic: [#296](https://github.com/euisuh/hanja-trainer/issues/296).

## Decision: Capacitor around the existing SPA

The Worker already owns everything that is hard to port: FSRS scheduling
(`worker/api/reviews.ts`), queue and distractor building (`worker/api/cards.ts`
→ `shared/buildQueue.ts`), and idempotent review writes keyed by
`(profile, session, cardIndex)`. The client renders what the API returns.

| Option | Reuse | Cost | Verdict |
|---|---|---|---|
| Capacitor (WebView shell) | ~100% of `src/`, all CSS, all e2e | auth/CORS work, a few native adapters | **chosen** |
| React Native / Expo | `shared/`, `src/lib/apiClient.ts` | rewrite every screen and ~2,000 lines of CSS | only if WebView performance proves insufficient |
| Swift + Kotlin | API contract only | two full apps | no |

Revisit only if a real device shows the session screen dropping frames.

## Roadmap

```mermaid
flowchart LR
  subgraph P0["Phase 0 · Restructure"]
    A281["#281 shared/ top level"]
    A282["#282 src/platform seam"]
    A295["#295 Access leftovers"]
  end
  subgraph P1["Phase 1 · API from native origin"]
    B284["#284 bearer tokens"]
    B285["#285 CORS allowlist"]
    B286["#286 client token"]
  end
  subgraph P2["Phase 2 · Runs on devices"]
    C287["#287 Capacitor shell"]
    C288["#288 native adapters"]
    C289["#289 safe area + fonts"]
  end
  subgraph P3["Phase 3 · Mobile life"]
    D290["#290 outbox engine + durable storage"]
    D291["#291 compat gate"]
  end
  subgraph P4["Phase 4 · Distribution"]
    E292{"#292 tenancy decision"}
    E293["#293 mobile CI"]
    E294["#294 store readiness"]
  end
  A281 --> A282 --> B286
  B284 --> B285 --> B286 --> C287
  C287 --> C288
  C287 --> D290
  B286 --> D291
  C287 --> E293
  E292 --> E294
  C288 --> E294
```

## Why each phase exists

### Phase 0 — Restructure
- `shared/` is the contract consumed by the Worker, the web client, and the
  native shell. It must stay free of DOM, React, and Worker APIs.
- `src/platform/` is the only place allowed to touch platform capabilities
  (API origin, haptics, storage, lifecycle, later `@capacitor/*`). Screens and
  features import from it; they never branch on platform themselves.
- `VITE_API_ORIGIN` unset = web build, same-origin, unchanged behavior.

### Phase 1 — Authentication from a native origin
The session is an `HttpOnly; SameSite=Strict` cookie. A WebView served from
`capacitor://localhost` / `https://localhost` never sends it to
`hanja.uiseoya.com`, and the Worker rejects cross-site writes and emits no CORS
headers. The signed token inside the cookie is self-contained, so the fix is to
also accept it as `Authorization: Bearer`, allow exactly the two Capacitor
origins, and refuse cookies from them.

### Phase 2 — Runs on devices
Add the Capacitor projects, then replace web behaviors that WebViews lack:
`navigator.vibrate` (absent on iOS), token persistence, flushing outboxes on
app resume (no `online` event after suspension), Android back button inside a
session, microphone permission strings. Safe-area insets and self-hosted fonts
also help the mobile web today.

### Phase 3 — Survives real mobile life
- iOS can purge WebView `localStorage`; queued answers must be mirrored to
  native storage. Do the duplicated outbox extraction first so the fix lands
  once.
- Installed builds outlive Worker deploys; a public compatibility endpoint
  lets the Worker tell stale apps to update instead of failing silently.

### Phase 4 — Distribution
The deployment is one household: profile names are public and PIN-less
profiles are selectable by anyone. That is fine for private distribution
(TestFlight internal, Play internal track). A public store listing requires
real accounts first — an owner decision tracked in #292.

## Rules while this is in progress
- Keep scheduling and queue building on the Worker. Never duplicate them in
  the client for speed; use optimistic labels instead.
- New API routes keep returning JSON with `{ error: { code, message } }`.
- Additive API changes only; a breaking change bumps `API_COMPAT_VERSION` (#291).
- `@capacitor/*` imports live only in `src/platform/` and `src/main.tsx`.
