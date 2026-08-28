# Design Prompt: Hanja/Kanji/Hanzi Trilingual Learning App

Paste this into Claude Design to get wireframes for a Duolingo-style web app.

---

## What this is

A gamified, spaced-repetition web app for learning Chinese-origin characters
(漢字/汉字/한자) across three languages at once: **Korean (Hanja), Japanese
(Kanji), Chinese (Hanzi)**. Same character, same core meaning, three
different pronunciations — the app teaches all three together, leveraging
the fact that a Korean learner already has a head start via Sino-Korean
vocabulary.

Single user, no social/accounts complexity. Core promise: replace
doomscrolling with fast, keyboard-driven, high-dopamine review sessions that
actually move you up real standardized-test levels.

## Curriculum basis (real tests, not invented levels)

Each character entry carries native badges from the actual exams — no
made-up unified scale:

| Track | Tests used | Level scale shown |
|---|---|---|
| Korean | 한자능력검정시험 (급수) | 8급 → 특급 |
| Japanese | 漢字検定 (Kanken) + JLPT | 10級→1級, N5→N1 |
| Chinese | HSK 汉字 list + 通用规范汉字表 | HSK1→7-9, 常用字 tiers |

Content starts at absolute basics (급수 8, Kanken 10級, HSK1) and climbs to
advanced (특급, 1級, HSK7-9/生僻字 fringe).

Example sentences are pulled from real corpus/textbook/past-paper material
per test — not AI-generated — so what you study matches what you'll
actually see on the exam.

## Core data unit

One "character entry" = 1 glyph +:
- KR: 훈/음 (meaning+sound), 급수 level
- JP: on'yomi + kun'yomi, Kanken level, JLPT level
- CN: pinyin + meaning, HSK level, 通用规范汉字表 tier
- Real example sentence per track, target character highlighted
- Your personal FSRS review state (stability, difficulty, due date, history)

## Learning loop

1. **Placement test** (first run, per track, ~15-20 adaptive items) sets your
   starting level so you're not redoing what you already know.
2. **Daily session** mixes new cards with FSRS-due reviews.
3. **Exercise format**: 4-option multiple choice, answered via number keys
   (1-4) — no typing, no mouse. Character shown large, example sentence
   shown with target char highlighted, translation reveals after you answer.
4. **Cross-track reinforcement**: once a character is known in one track, it
   periodically resurfaces as a "compare" card — shows all three
   pronunciations side by side to cement that it's one meaning, three sounds.
5. Correct/wrong = immediate flashy animation + combo counter. This is the
   dopamine layer — make it feel like Duolingo's chest-opening/streak-flame
   moments, not a quiz app.

## Screens to wireframe

1. **Onboarding**: pick tracks (KR/JP/CN, default all three checked) →
   placement test flow → lands on home.
2. **Home / path map**: skill-tree style map per track (tab switcher between
   KR/JP/CN maps), streak counter + XP header, big "Start Lesson" CTA,
   today's-progress ring.
3. **Lesson screen**: the core quiz — big glyph, 4 numbered answer choices,
   progress bar for the session, combo counter, animated feedback on
   answer, all keyboard-operable.
4. **Review queue**: same mechanics as lesson screen, but pulls from
   FSRS-due cards specifically; separate entry point from "new content."
5. **Character detail page**: glyph large, all three tracks'
   sound/meaning/level badges laid out side by side, example sentences,
   your personal accuracy history / interval graph for that character.
6. **Stats dashboard**: streak calendar (GitHub-contribution-graph style),
   mastery-map completion % per track, level progress framed against the
   real test scale (e.g. "620/1000 chars to 한자 3급").
7. **Settings**: keyboard shortcut cheat-sheet, track on/off toggles, daily
   goal slider.

## Interaction model — keyboard-first, hard requirement

Primary usage is laptop + Bluetooth keyboard for speed; mouse/touch must
never be required, only optionally supported for mobile review sessions.

- `1`–`4`: select answer choice
- `Enter` / `Space`: confirm and advance to next card
- `Esc`: pause session
- Arrow keys: navigate menus/maps
- Every screen must have a full keyboard path — design the wireframe with
  visible focus states and number-key labels on choice buttons, not just
  clickable cards.

## Visual/aesthetic direction

- Duolingo-adjacent: bold rounded shapes, saturated color per track (suggest
  distinct accent colors for KR/JP/CN tabs so track identity is instant),
  mascot-optional but strong character-glyph-as-hero treatment.
- Big, juicy micro-animations on correct answers (bounce, particle burst,
  combo number pop) and a softer "try again" shake on wrong — the
  dopamine-loop is a core requirement, not polish.
- Skill-tree/path map should read as a game level-select screen, not a list.
- Mobile-first responsive, but every mockup should also show the
  keyboard-focused desktop/laptop layout since that's primary usage.

## Backend context (for realism, not binding)

Suggested stack: Cloudflare Workers + D1, FSRS state persisted server-side
so progress survives cache clears and syncs across devices. Solo user, no
auth complexity beyond a single account. Mention this only if Claude Design
asks about data persistence affecting layout (e.g. sync status indicator).

## Explicitly out of scope

- No stroke-order/writing practice — reading + sound recognition only.
- No social features, leaderboards, or multi-user accounts.
- No typed/IME text input for answers — multiple choice only.
