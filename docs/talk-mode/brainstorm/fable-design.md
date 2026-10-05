# Speaking path: four non-Duolingo design directions (Fable)

Scope: visual + interaction design only. Nothing in the repo was modified except `etc/brainstorm/`.
Mocks (static, Google Fonts only, follow system light/dark): `design-playbill.html`, `design-notebook.html`, `design-broadcast.html`, `design-signage.html`.

## What the current UI is (read from the repo)

- `src/design/tokens.ts`: paper `#F7F6F4` ("quiet" palette), hard offset shadows (`0 3px 0` .. `0 7px 0` in ink), radii 12-28px, pill 999px, per-track accent (kr `#3B5BDB`, jp `#C23F29`, cn `#0B7D56`), gold/flame for streak.
- `src/styles.css`: one global rule makes ~25 selectors "raised surfaces that depress by their shadow offset" (answer-option, lesson-cta, review-cta, track-card, ...). This is the candy-button look.
- `src/features/path-map`: vertical node path (glyph circles, done/next/locked states), `PathMap.tsx` heading "N / M 자", hint "up/down + Enter".
- `src/shell/BottomNav.tsx`: 4 tabs (지도 H, 복습 R, 통계 T, 설정 ,) each with a `<kbd>`.
- `src/screens/SpeakingScreen.tsx`: already exists, per-unit, jp/cn only, cards = sentences with `reading`, `PASS_TARGET = 3` passes, `LocalRecorder` (local recording playback, no scoring), `speechSynthesis` voices, `sentenceAudioUrl`.
- UI language is Korean; glyph fonts are Noto Serif KR/JP/SC (fontsource, already installed), UI font Plus Jakarta Sans + Noto Sans KR.

Implication for every direction below: the learner is Korean, studying Japanese speech. Kanji in a sentence (大丈夫) is a bridge to Sino-Korean (대장부). That bridge is this app's unique asset and each direction surfaces it as a quiet inline "hanja chip", not a reward.

Shared rules for all four (so Codex can build one token layer and swap themes):
- Keep `tokens.ts` structure; replace values. Delete the "raised surface depress" rule block in `styles.css`. Replace with `:active { background: var(--press) }` (no translate, no shadow).
- Focus ring: 2px solid accent, offset 2px. Keep keycaps (`kbd`) because keyboard-first is a product requirement, but restyle as plain mono text.
- Motion: no bounce, no confetti, no scale-on-press. Only opacity/background 120ms linear-ish `cubic-bezier(.2,0,0,1)`, and playhead/waveform motion that carries real information. `prefers-reduced-motion`: waveform becomes static bars, transitions 0.
- Recording is local-first (existing `LocalRecorder`). Do not claim pronunciation scoring unless a backend exists. "Feedback" = compare your take to native audio (waveform/pitch overlay, A/B toggle) and a self-rating of 3 states. Honest by design.

---

## Direction 1: Playbill (stage / script)

**Concept.** A daily-conversation path is literally scripted dialogue, so present it as a play script. A "unit" is an act, a conversation is a scene (場), each line has a speaker column set in small caps mono, the other person's lines are printed, and YOUR lines are the highlighted cue where you speak. Role-play maps 1:1 onto the layout: you read the script, then the other party's lines play as audio and yours is blank. Mincho (serif) kana/kanji at large size is where CJK looks best: stroke contrast, readable kana shape, ruby above kanji. Suits speaking because a script is already the format humans rehearse from.

**Tokens**
| token | light | dark ("house lights down") |
|---|---|---|
| paper | `#F3EDE0` | `#14110E` |
| ink | `#1B1712` | `#EDE5D3` |
| muted | `#6B6354` | `#A39A86` |
| rule | `#CFC6B2` | `#3A342B` |
| cue (you / record) | `#9E2B25` | `#D4574D` |
| cue-soft | `#EBD9CF` | `#2A1A17` |
| other speaker | `#2F4A5E` | `#7FA3BC` |
| ok | `#2F6B3F` | `#78B98A` |

Contrast: ink on paper 15:1, muted on paper 5.2:1, cue on paper 6.6:1 (check with `lint:colors`).
- Type: JP lines `Shippori Mincho` 600 (fallback `Noto Serif JP`); Korean gloss `Gowun Batang` (fallback `Noto Serif KR`); UI labels `Zen Kaku Gothic New` 500/700 + `Noto Sans KR`; speaker/timecodes `IBM Plex Mono`.
- Scale (px): 11 mono label / 13 UI / 14 gloss / 15 body / 22 other-speaker JP / 26 your-line JP / 30 scene title / 44 act numeral. Line-height 1.5 for JP.
- Spacing: 4px base; script rows 12px vertical padding, 1px rules between rows, 20px page gutter.
- Radius: 0 everywhere except 2px on inputs. Borders are 1px rules; 2px only on your line.
- Motion: row reveal by opacity 120ms as dialogue advances; active line gets a 2px cue rule that moves down (transform on a pseudo-element, 160ms).

**Home ("Programme")**: header strip `第二幕 · 場 3 / 8` mono + date. Below: "Tonight's scene" as a big card styled like a playbill billing: act numeral, scene title in Mincho 30px (`レジで`), one-line stage direction in italic Gowun Batang, a cast list ("店員 / あなた"), duration, buttons `Rehearse` (Enter) and `Listen first` (L). Under it a plain table of contents: acts as sections, scenes as rows with leader dots and status text (`unseen`, `read`, `spoken ×3`, `due`). No path map. Due reviews appear as a one-line "Callback: 5 lines due" row at top, linking to a mixed review of lines.

**Speaking session (mock: `design-playbill.html`)**: three modes in one screen, switched by `1/2/3` or a segmented control in the header: 1 Read (all lines visible, tap a line to hear), 2 Shadow (the line plays, you repeat; waveform strip under your line), 3 Role-play (other party's lines auto-play and are hidden by default; your line shows only the Korean gloss; `H` toggles a hint of the JP). Layout: sticky mono header (`場 3/8`, Esc), scrolling script, sticky bottom 3-cell bar (Listen Space, Record R, Hide hint H). States per your line: `waiting` (cue-soft fill, 2px cue border), `recording` (waveform live, bar button shows stop and elapsed mono time), `review` (A/B: native vs you, toggle with Space/Tab; self-rate keys 1 again / 2 ok / 3 good), `done` (line turns ink, check as text "spoken"). Hanja chip row appears under your line only on first exposure.

**Progress ("Programme" page)**: replaces path map and stats screen. A two-level list: Acts (progress as `4 / 8 scenes`) and scenes (rows). Per scene a text status plus a 8-segment bar (1px outlined cells) for lines spoken. A "Repertoire" tab lists every line you have said with last-spoken date, filter by scene or by kanji. No XP.

**Mobile + keyboard**: single column 440px max; desktop gets a 2-column layout (script left 560px, right rail with the line's kanji breakdown and waveform compare). Keys: Space listen, R record/stop, 1/2/3 self-rate, H hide hint, arrow up/down line focus, Enter advance, Esc leave. Bottom bar is a thumb-reach 3-cell strip, 56px tall.

**Replaces**: `PathMap`/`PathNode`, `LessonScreen` chrome, hard shadows, rounded CTA. `BottomNav` becomes 3 items: Programme, Review, Notes.

**Gamification**: replace. Streak becomes "Rehearsal log": a plain 12-week calendar of dates you spoke at least once (square cells, one ink tone, no flame, no loss framing). XP removed; scene completion = "spoken ×3 on separate days" printed as text. Hearts: none.

---

## Direction 2: Phrasebook (field notebook)

**Concept.** The product is a personal phrasebook you fill in for real situations (airport, shop, restaurant, hospital, train). Each page = one phrase in a situation, hand-annotated: pitch contour arrow, pencil notes, highlighter on the kanji that match Hanja. Ruled paper with a margin line and side tabs by situation. Soft, personal, slower; best for learners who want to build a reference they re-open. Klee One (a pen-lettered textbook face) makes kana feel written, which helps learning stroke shapes and reading kana as handwriting.

**Tokens**
| token | light | dark |
|---|---|---|
| paper | `#FBF8F1` | `#181A20` |
| ruled line | `#D5E0EA` | `#2A3140` |
| ink (navy) | `#1F2A44` | `#E6E8EE` |
| muted | `#5C6478` | `#9AA2B5` |
| pencil red (record, notes) | `#C2412D` | `#F0806B` |
| highlighter | `#FFE58A` | `#5A4B12` |
| tab green | `#2E6F5E` | `#6DBBA4` |

- Type: JP phrase `Klee One` 600 at 34px; reading `Zen Maru Gothic` 500; Korean UI/gloss `IBM Plex Sans KR`; mono meta `IBM Plex Mono`. Fallback `Noto Sans JP`, `Noto Sans KR`.
- Scale: 12 / 14 / 15 / 20 / 34 / 40. Base rhythm = 32px ruled line; every text block snaps to the 32px grid (line-height 32px for gloss, 48px for JP).
- Radius: 3px buttons, 0 cards; tabs 0 5px 5px 0. Borders 1.5px ink on interactive elements.
- Motion: page turn = 140ms horizontal slide of 12px + fade (no flip). Highlighter wipe 200ms left-to-right when a kanji hint is revealed.

**Home ("Index")**: ruled page, left tab strip (vertical text: 空港 買物 食事 交通 病院 ...), top mono line `p.42 · 買物`. Content: "Next page" card (phrase title in Korean, e.g. `#17 편의점에서 봉투를 거절할 때`) + `Continue` (Enter); beneath, "Filling in: 買物, 12 / 30 phrases" as a ruled list with a pencil-circle on phrases you've spoken. Search box (`/`) over all phrases, by Korean, kana or kanji.

**Speaking session (mock: `design-notebook.html`)**: one phrase per page. Top: situation prompt in Korean ("점원이 봉투 드릴까요 라고 물었다"). Center: JP phrase with a highlighter band on the kanji word, red pencil reading, Korean gloss, a slanted pencil note (hanja bridge + pitch note). Lower: a boxed "my attempt" panel (attempt count, play-back, tiny waveform). Bottom bar: Listen / Record / Next page. Role-play mode is "Dialogue spread": two facing columns on desktop (their line / your line), stacked on mobile; their line plays, your side is blank ruled lines until you speak, then the target appears in red pencil as a correction layer. Shadow mode: phrase broken into segments on separate underlined chunks (`いいえ / 大丈夫 / です`), tap a chunk to loop it.

**Progress ("Contents")**: a table of contents with tab colors; per phrase row a hand-tick (SVG stroke) once spoken on 2 separate days; "weak pages" section lists phrases rated "again" twice. Calendar as a ruled-grid "diary" with a pencil dot per speaking day.

**Mobile + keyboard**: the margin tabs collapse to a horizontal scrolling strip under the header on <600px. Keys as in Playbill plus `/` search, `[` `]` previous/next page, `N` focus the note field (user can add own pencil note, stored per phrase, which is a genuine reason to return).

**Replaces**: path map -> Index + Contents, `StatsScreen` -> diary calendar, quiz cards remain for kanji review but restyled as flashcards printed on paper.

**Gamification**: reduce to near zero. No XP. Streak shown only as the diary calendar. A single weekly line "5 days spoken this week" in mono. No loss framing. The motivating hook is the growing personal phrasebook with your own notes.

---

## Direction 3: Broadcast (audio-first, tape/radio)

**Concept.** Speaking is sound, so make sound the interface and text secondary. Every item is a clip on a timeline: native waveform on top, your take below, playhead and A/B loop controls like a voice-memo editor. Dark by default (listening and commuting use), amber signal color, monospace timecodes, lots of space for the waveform. Strongest direction for shadowing and "listen to replies" because the primary object is the clip, and transcript can be masked to force listening. CJK appears in IBM Plex Sans JP, a neutral gothic that stays legible at 14px for fast kana reading.

**Tokens**
| token | dark (default) | light |
|---|---|---|
| bg | `#0F1113` | `#EFEEEA` |
| surface | `#181B1E` | `#E4E2DC` |
| text | `#E8E6E1` | `#15171A` |
| muted | `#9A978F` | `#5E5C56` |
| rule | `#2B2F33` | `#CFCDC6` |
| signal (native/playhead) | `#F2A93B` | `#B26A00` |
| record | `#E5564A` | `#C23A2E` |

- Type: `IBM Plex Sans JP` 400/500/600 for JP, `IBM Plex Sans KR` for Korean, `IBM Plex Mono` for timecodes/labels. Alternative JP face: `BIZ UDPGothic`.
- Scale: 12 mono / 14 / 15 / 18 / 26 JP target / 32 timecode large. JP line-height 1.55.
- Radius: 2px controls, 50% only on the record button. 1px rules, no shadows.
- Motion: playhead moves linearly with audio; karaoke highlight on the transcript follows the playhead (color change, no animation). Record button: 2px ring with inner disc, disc shrinks to rounded square on recording (120ms).

**Home ("Queue")**: header shows the current clip count. Primary block: "Next up" = a clip card with title, duration, a static mini waveform, a play button (Space) and `Shadow` (Enter). Below, a vertical list of Queue items (conversations to listen, lines due for shadowing, role-plays), each row: waveform thumbnail 80x24, title, duration, state word. A "Commute mode" toggle (`C`) runs listen-only: it plays dialogue, pauses on your line for N seconds (silence you fill aloud), no screen interaction. This works with the screen off on native.

**Speaking session (mock: `design-broadcast.html`)**: top transport waveform (native) with the currently played segment in signal color; timecodes; speed chip (0.6x/0.8x/1x, keys `-` `+`). Transcript below is segment-synchronised: played kana in signal color, unplayed dimmed. Compare card: pitch/intensity contour overlay (native grey vs yours amber) and duration delta. Bottom dock: prev, big record button (R; hold-to-talk optional via setting), next. Role-play: the clip is a two-track conversation; the other party's track plays, a gap appears with a countdown bar the length of your expected line, you speak, the next clip continues. After the scene, a stitched playback of the full conversation with your lines in your voice is available (strong motivator, local audio only).

**Progress ("Log")**: reverse-chronological session log: date, scene, takes, minutes. Header numbers: minutes spoken this week, lines recorded, and an "Earliest vs latest take" comparison for any phrase (hear your improvement). Heatmap-free; a simple 7-bar chart of minutes per day.

**Mobile + keyboard**: dock is always visible at bottom (thumb reach), 64px record button center. Keys: Space play/pause, R record/stop, `[` `]` loop in/out, `-`/`+` speed, `T` toggle transcript mask, Left/Right previous/next segment, Esc leave. Works one-handed. Audio-focus handling and background audio for commute mode need Capacitor plugins (flag for Codex).

**Replaces**: path map, session chrome, answer-option grid for the speaking path; review cards for kanji remain with the paper theme off (Broadcast applies only to speaking surfaces by default, see integration note).

**Gamification**: replace with measurable audio facts: minutes spoken, takes recorded, and personal-best comparisons. Streak reduced to "days spoken" as plain count in the Log header. No XP, hearts, or levels.

---

## Direction 4: Signage (wayfinding / transit)

**Concept.** Japan's own daily-life visual language: station signs, line numbers, route strips with stops. A situation is a Line, a conversation is a route, each exchange is a Station, you "arrive" when you have said all your lines. Matches the real-life framing (convenience store, train, hospital) and shows progress as position, not points. Heavy sans, thick 3px rule boxes, line-color roundels with a number. BIZ UD Gothic is built for signage-grade legibility, which suits CJK at distance and small sizes. It is also the most structured and fastest to scan.

**Tokens**
| token | light | dark |
|---|---|---|
| bg | `#F4F4F1` | `#0E1013` |
| ink | `#111111` | `#F2F2EE` |
| muted | `#585858` | `#A8A8A2` |
| rule | `#111111` | `#F2F2EE` |
| line colors (per situation, 6 max) | `#0A5BA8` `#B8431E` `#1B7F4B` `#7A3FA0` `#A16A00` `#00758A` | `#5AA2E6` `#EE8A62` `#58C08A` `#B98AD8` `#E0A63A` `#4CB8CE` |
| sign (header/bar) | `#111111` on text `#FFFFFF` | `#F2F2EE` on text `#0E1013` |

All line colors checked against white text for roundels; verify 4.5:1 for text use and use ink for text on tinted fills.
- Type: JP `BIZ UDPGothic` 400/700; Korean `Noto Sans KR` 400/500/700; labels/numerals `Inter` 500/700 uppercase letter-spacing .1em.
- Scale: 11 / 12 / 14 / 15 / 20 / 24 / 28 JP / 38 numerals.
- Radius: 0 for panels, 50% for the line roundel and station dots only. Borders 3px. No shadows.
- Motion: route strip fills dot-by-dot on arrival (dot fill 160ms); nothing else moves.

**Home ("Lines")**: a list of Line cards, each with roundel number, name (`買物 · 편의점`), a route strip of 6-8 stations with filled dots up to your position, and the station name (`次: 会計`). The current Line is expanded to a sign panel with the next conversation and `Board` (Enter). Bottom: "Due" strip, e.g. `Transfer: 4 lines due`. Station-sign style for the date and place at the top.

**Speaking session (mock: `design-signage.html`)**: black header with line roundel, name, `駅 4 / 8`, next station. Route strip with station labels (入店 温め 袋 会計 決済 退店). A boxed sign panel for the other party's line (header bar `店員 | play`) and, under a `↓ 대답하세요` arrow, your target line in a line-colored outline box. Bottom black bar of three full-width cells: Replay, Speak (line color, primary), Next station. States: `boarding` (dot ring), `speaking` (cell turns record color with mono elapsed time), `compare` (native/yours toggle), `arrived` (dot filled, panel header gets "OK" text). Role-play = run the whole Line station by station, the other party's panel autoplays, your box is blank until you speak.

**Progress ("Network map")**: a diagram of all Lines as parallel horizontal route strips (one per situation), station dots filled for stations spoken on 2+ days. Transfer points (shared vocabulary like すみません) are drawn as a linking vertical tick between lines, so learners see reuse. Tapping a station opens its lines.

**Mobile + keyboard**: strongest on mobile: sign blocks are big targets. Desktop: the route strip stays at top, Station list on left. Keys: Space replay, R speak, Enter next station, `[`/`]` previous/next Line, 1-3 self-rate, Esc exit.

**Replaces**: path map (spatially replaced by route strips; keeps the "you are here" idea but horizontal and flat), nav bar with a 3-cell sign bar, node glyph circles.

**Gamification**: replace with position. "Stations reached" and Line completion are the only progress units. Streak reduced to a one-line "last spoke: today" in the header. No XP, hearts, or flame. Optional "timetable" calendar of days spoken in Stats.

---

## Comparison

| | Playbill | Phrasebook | Broadcast | Signage |
|---|---|---|---|---|
| Best at | role-play, reading scripts | reference + notes, kana shapes | shadowing, listening | scanning, situation framing |
| Weakest at | audio-only use | speed, structure | reading/kanji study | long free-form dialogues |
| Mood | literary, calm | personal, slow | focused, technical | clean, functional |
| Build cost | low (text + 1 bar) | medium (ruled bg, notes, tabs) | high (waveform, compare, commute mode) | medium (route strip SVG) |
| Kanji/Hanja fit | high (mincho, ruby) | high (highlighter) | medium | medium |
| Fits existing paper theme (`#F7F6F4`) | yes | yes | no (dark first) | yes |
| Gamification | replaced by rehearsal log | near zero | measurable audio stats | position on route |

## Recommendation: Playbill, with Broadcast's compare view borrowed

Why: the speaking path's core activities (read the exchange, shadow a line, play a role, hear the reply) are exactly what a script is for, so the layout is the pedagogy. It costs least (text rows, rules, a 3-cell bar), reuses the Noto Serif/paper tokens already installed, keeps keyboard-first, and gives Hanja a natural place (ruby and the hanja chip row under the line you speak). It also lets the existing kanji/review screens adopt the same paper look with minimal change, so the app does not become two products. Borrow from Broadcast only the A/B waveform compare strip inside the review state.

Integration note: apply the new theme app-wide (one design, not two). Keep the track accents only as small text labels (KR/JP/CN), not as large fills.

## Suggested Codex implementation slices

1. Tokens + theme: new palette/type/radius/motion values in `src/design/tokens.ts` (`playbill` light/dark), add fontsource `shippori-mincho`, `zen-kaku-gothic-new`, `gowun-batang`, `ibm-plex-mono`; update `lint:colors` allowlist. No screen changes.
2. Strip candy styling: remove the "raised surfaces depress" block and hard shadows in `styles.css`, set radii to 0/2px, replace with `:active` background change. Verify e2e screenshots.
3. Shell: `BottomNav` -> 3 items (Programme, Review, Notes) with mono `kbd` hints; `AppHeader` mono meta line. Update `shortcuts.ts` and the Playwright keyboard tests.
4. Script components: `ScriptLine`, `SpeakerLabel`, `Ruby`, `HanjaChips`, `ActionBar` (3-cell) in `src/features/speaking/`, with unit tests for ruby/chip rendering from `ApiSentence`.
5. Speaking session v2: rebuild `SpeakingScreen` on those components with Read/Shadow/Role-play modes, states waiting/recording/review/done, key map (Space, R, H, 1-3, Enter, Esc). Reuse `LocalRecorder`, `speech.ts`, `sentenceAudioUrl`. Cover with e2e keyboard test.
6. Data: scene/act model for conversations (table + shared types in `shared/api.ts`, migration, seed from real material only, speaker role per line, audio URL per line). Needs an issue of its own; blocks slices 5-role-play and 7.
7. Programme (home) + Programme progress page replacing `PathMap` for the speaking path; keep `PathMap` for the kanji track until slice 9.
8. Rehearsal log: replace streak/XP surfaces with the 12-week plain calendar and "spoken x3 on separate days" completion rule; migrate `StatsScreen`.
9. Retheme remaining screens (Lesson, Review, Detail, Onboarding, Settings) to the new tokens; remove dead path-map CSS.
10. A/B compare strip (Broadcast borrow): waveform of native vs take, Space/Tab toggle, honoring `prefers-reduced-motion`.

Open decisions for the owner: (a) one theme app-wide or speaking-only first, (b) keep a streak at all, (c) is pitch-accent display in scope (needs data), (d) native commute/background audio mode in scope.
