# Talk mode: Japanese daily-conversation path

Status: owner-approved direction, 2026-10-05. This file is authoritative. The
earlier brainstorm notes were removed from the tree (see git history before
the public-readiness commit).

## Goal

A Japanese path whose only job is real-life spoken conversation. The unit of
learning is a phrase ("chunk") used in a situation, not a kanji. It is a new
**Talk mode**, separate from the kanji/hanja tracks, which stay unchanged.

## Owner decisions

| # | Decision | Resolution |
|---|---|---|
| 1 | Design direction | **Notebook** (Phrasebook). Not Playbill. |
| 2 | Scope | New Talk mode under the JP track. Not a replacement of the whole app. |
| 3 | Theme rollout | Notebook look is built for Talk only first (Phase 1). App-wide retheme is Phase 2, after Talk ships. |
| 4 | Dialogue sourcing | Default (a): Japanese text comes from licensed corpora with exact `source_ref`; Korean cue cards and scene order are human-written. Missing lines are logged as gaps, never invented. Revisit if the gap log is large. |
| 5 | Streak / XP | None in Talk. A plain diary calendar and one weekly line only. |
| 6 | STT feedback, pitch-accent display | Out of Phase 1. |

Defaults 4-6 were not explicitly answered; they are my recommendation. Change them
here before the content or feedback slices start.

## Phase 1 scope

- 16 situation units.
  Phase 1 ships the engine plus pilot unit 2 ("ask someone to repeat"); other
  units are one data PR each later.
- Cards: say-from-Korean-cue (A), listen-and-pick-intent (B), linear scene
  role-play (E). Shadowing/branching/free speech come after.
- Phrases are FSRS cards (`shared/fsrs.ts`), separate `say` and `hear` states.
  Grades: 못함 = again, 막힘 = hard (over 3 s onset or wrong register), 바로 = good.
- Only objective speaking signal: time-to-first-speech measured on device with
  `AnalyserNode`. No audio leaves the device. Everything else is self-graded and
  the UI says so.
- No pronunciation score, no "fluency" claim.
- Data model: `conv_*` tables (next migration is `0025`) with the chunk fields
  (`register`, `role`, `source_kind`, `source_ref`, `audio_key`).
- Existing kanji/hanja code paths and tests must keep passing.

## Notebook design (Talk only in Phase 1)

Tokens (light / dark): paper `#FBF8F1` / `#181A20`; ruled line `#D5E0EA` / `#2A3140`;
ink `#1F2A44` / `#E6E8EE`; muted `#5C6478` / `#9AA2B5`; pencil red (record, notes)
`#C2412D` / `#F0806B`; highlighter `#FFE58A` / `#5A4B12`; tab green `#2E6F5E` / `#6DBBA4`.
Type: JP phrase Klee One 600 34px; reading Zen Maru Gothic 500; Korean UI
IBM Plex Sans KR; mono meta IBM Plex Mono. Radius 3px buttons, 0 cards, 1.5px ink
borders on interactive elements. Page turn = 140ms 12px slide + fade, honoring
`prefers-reduced-motion`.

Scope the tokens to a Talk root class so kanji screens are visually untouched
until Phase 2. Keyboard-first (Space, R, 1-3, Enter, Esc, `/`, `[` `]`), mobile
responsive, all new colors pass `lint:colors`.

## Rules for every slice

- One PR per slice, `Closes #N`. `npm run typecheck && npm run lint && npm test` green.
- Run `npm run lint:slop:changed` if the script exists.
- Content PRs: every Japanese line needs a verifiable `source_ref`; the validator
  from the seed-format slice must pass.
- Licences: Tatoeba (CC BY 2.0 FR, attribute per sentence), Tanaka (public domain),
  JMdict (CC BY-SA 4.0), Common Voice ja (CC0), JVS (CC BY-SA 4.0). Do not ship
  JSUT, CEJC, Irodori. Record attribution in `data/SOURCES.md`.
- Do not touch kanji/hanja tracks except through shared helpers.

## Phase 2 (not started)

App-wide Notebook retheme, 3-item nav, replace path map and stats with
Index/Contents/diary, then STT transcript diff, pitch-accent display, offline
scene pack, placement via capstones.
