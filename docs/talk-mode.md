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
| 4 | Dialogue sourcing | Default (a): Japanese text comes from licensed corpora with exact `source_ref`; Korean cue cards and scene order are human-written. Missing lines are logged as gaps. **Amended 2026-11-06:** the gap log was large (no staff speech, no spoken-register chunks), so gaps listed in `data/conversation/GAPS.md` may be filled with `sourceKind: "authored"` rows, rules below. Every other line stays a verified Tatoeba sentence. |
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

## Authored lines (since 2026-11-06)

Tatoeba has almost no staff speech or spoken-register chunks, so a learner could not
practice a real till or restaurant exchange. A chunk may be `sourceKind: "authored"` only when:

- it is an NPC/staff line (`authoredScope: "npc"`, role `hear`), or a spoken-register chunk
  or learner reply that is listed in `data/conversation/GAPS.md` (`authoredScope: "spoken"`);
- it uses conservative, standard phrasing only (no slang, no invented idiom);
- it carries `authoredOn` (YYYY-MM-DD, the date it was written or last checked by whoever wrote it)
  and a non-empty `reviewNote` saying what was checked;
- `ownerReviewed` (YYYY-MM-DD) is optional and stays absent until the owner has read the line.
  Generators never set it. Before 2026-11-07 this date was named `ownerApproved` and was stamped
  by the generator, which overstated what had happened; the rename records the honest meaning.
  `npm run review:authored` writes `data/conversation/authored-review.md`, a checklist of every
  authored line grouped by unit, for the owner to work through;
- the UI shows it as "authored for this app" (`SourceAttribution`), never as Tatoeba.

Caps, enforced by `npm run validate:conversation`: authored rows (deduped by key) are at most
25% of all chunks, and authored `npc` lines are at most 50% of any one unit. Authored rows have
no audio until generated; `data/conversation/audio-todo.json` lists the `audioKey`s to generate
with `npm run audio:generate:conv` (needs remote credentials). Remove entries once audio exists.

Travel units 17-19 (transit, hotel, numbers and prices, added 2026-11-06) follow the same policy: each authored line
is listed in `data/conversation/GAPS.md`, and a Tatoeba row with no `owner` is never shipped because it cannot be
attributed. The cap was 20% when these units were added.

On 2026-11-07, 26 authored chunks fill repair, station-question, shopping, ingredient-omission,
and opinion-softener gaps in existing units 2, 5, 6, 8 and 16. The overall cap is now 25%;
the per-unit NPC cap remains 50%. Unique authored share: 132/697 (18.94%) before,
158/723 (21.85%) after. Unit 2 scene 1 now opens with an instruction to repair and repeats
that instruction after the learner asks again. This is content for a fast explanation,
not a new playback-speed setting; audio remains pending in `audio-todo.json`.

A second batch on 2026-11-07 adds 7 spoken-register and NPC lines to units 1, 6 and 16 (listed in
`data/conversation/GAPS.md`), taking the unique authored share to 165/730 (22.60%). No scene changes.

## Branching scenes (variants)

An NPC turn may carry 2-3 `variants`: `{ chunkOrd, replyOrd }` pairs. The runner plays one variant at
random per run and expects the matching `replyOrd` at the next learner turn. The turn's `chunkOrds` must
list exactly the variant chunks, and the learner turn right after must list every `replyOrd`. Replies must
converge (the scene stays linear after that learner turn). DB column: `conv_scene_turns.variants`.

## Slot drills (templates)

A unit file may carry `templates`: a pattern such as `___をください。` with 4-6 noun `slots` and a `{slot}`
Korean cue. `shared/slotDrill.ts` builds one say card per template (random slot, never the same twice in a row).
FSRS state is keyed per template (`conv_template_states`, state key `tpl:<key>`), not per slot. The pattern must
come from a shipped Tatoeba say chunk (`patternChunkKey`); slot nouns are authored (`reviewNote`).
`/api/conv/session` adds one `drill` item per new or due template before the closing scene; an attempt with
`templateId` (chunkId = the pattern chunk) writes `conv_template_states` instead of `conv_chunk_states`.

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
