# Design decisions

[Documentation index](README.md)

These entries describe choices visible in the repository, not measured outcomes.

## FSRS scheduling

Context: answers need a due date and retained state across sessions.
Decision: wrap `ts-fsrs` in [shared/fsrs.ts](../shared/fsrs.ts) and schedule in
[the Worker review handler](../worker/api/reviews.ts).
Consequence: D1 stores stability, difficulty and due state; delayed writes need
explicit event-time handling. Correct answers map to `good`, misses/skips to
`again`; elapsed answer time does not change that grade.

## One origin for SPA and API

Context: the browser needs static screens and profile-scoped APIs.
Decision: [Wrangler](../wrangler.jsonc) serves the Vite SPA and Worker on one
hostname, with D1 bound directly to the Worker.
Consequence: browser calls use same-origin cookies; native shells need the
separate bearer/CORS path in [the router](../worker/api/router.ts).

## Corpus-first Talk content

Context: Talk needs traceable Japanese examples plus staff/spoken-register lines
that the corpus may not cover.
Decision: retain Tatoeba references and label authored lines; enforce review
metadata and caps in [the validator](../scripts/validate-conversation.ts): 25%
authored overall (deduplicated by key); authored NPC keys may number at most
50% of all chunks in their unit.
Consequence: authored lines cannot silently replace the corpus. Gaps and missing
audio remain explicit. [Talk rules](talk-mode.md) describe the content contract.

## Device-side speech feedback

Context: learners need playback and a comparison with the line they attempted.
Decision: use [local recording](../src/features/study/speech.ts) and optional
[browser recognition](../src/features/study/recognition.ts); the shadowing UI
compares text. This app stores no recording or transcript in its backend.
Consequence: feedback is not a pronunciation score. Browser support varies;
recognition is browser-provided and the implementation does not guarantee that
the browser processes it entirely on-device. Attempt grades and metrics still
persist through [conversation attempts](../worker/api/conversationAttempts.ts).

## Per-visitor guest sandboxes

Context: public visitors need to try the app without sharing learner state.
Decision: [demo.ts](../worker/api/demo.ts) creates isolated guest profiles and
resumes valid existing sessions, with rate, capacity, write and expiry limits.
Consequence: progress is temporary, not merged into real profiles; stale guest
rows are purged lazily on creation. [Architecture](architecture.md#auth-and-guest-model)
lists the exact limits and profile restrictions.

## One Quiet theme

Context: study screens and three tracks need a consistent visual vocabulary.
Decision: share one palette, font set and radius map through
[design tokens](../src/design/tokens.ts); [contribution rules](../CONTRIBUTING.md)
keep the Quiet design and ban pills, gradients, monospace labels and emoji UI.
Consequence: track accents vary within the shared tokens; there is no separate
user-selectable theme system to maintain.

## Offline write queue

Context: a connection loss must not discard an answered card or duplicate it
when a request is retried.
Decision: [the outbox](../src/features/session/outbox.ts) persists pending writes;
[review submission](../worker/api/reviews.ts) caches idempotent responses and
uses the original answer time. [Native storage](../src/features/session/outboxStorage.ts)
mirrors pending/rejected entries to Capacitor Preferences.
Consequence: retries survive ordinary interruptions, with explicit rejected
entries; mirroring is asynchronous and does not guarantee survival of an abrupt
kill. Cards are not downloaded for offline study. See [mobile limits](mobile.md).
