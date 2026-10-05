# Japanese Daily Conversation Path — curriculum architecture

Angle: curriculum architect. Scope: a Japanese-only path that puts speaking first. It sits beside the
existing character tracks and does not replace them.

## 0. What exists today (constraints I designed around)

- The JP curriculum is 2,211 kanji split into units of 8–10 characters (`data/SOURCES.md`, JLPT via kanji-data).
  The only sentences are Tatoeba rank-0 examples of 24 code points or fewer, chosen because they contain a
  target glyph and **not** because they are useful in conversation (~280 JP rows).
- `review_states` uses the primary key `(profile_id, character_id, track)` with a foreign key to
  `character_tracks`. Phrases cannot live there, so they need their own state table.
- `shared/fsrs.ts` already exposes four grades (`again|hard|good|easy`). The UI uses only two self-check labels.
- `SpeakingScreen` + `LocalRecorder` (`src/features/study/speech.ts`) already record a clip of up to 15 s,
  keep it in memory and play it back. Cached Google TTS sentence audio is keyed by Tatoeba id. The scope doc
  forbids uploading audio in this phase and forbids claiming pronunciation scores.
- Repo rule: real corpus/textbook text only, no generated sentences. Past papers are capped at zero rows.

## 1. Learner assumptions (please correct any that are wrong)

1. Native Korean speaker who reads kana fluently and works through the JP kanji track. The path does not teach kana.
2. Comprehension sits around N4–N3 vocabulary, but **speaking is near zero to A1**: the learner can read
   ありがとうございます but cannot produce 「袋いらないです」 within 2 seconds of a cashier asking.
3. Goal: hold real daily conversations in Japan, both service encounters and talk with acquaintances or
   colleagues. Exams are not the goal, and neither is formal business keigo production.
4. 15–25 minutes a day, on a laptop keyboard or a phone. A microphone is available but sometimes can't be
   used (subway), so every speaking card needs a "silent mode" fallback (mouth it, then self-check).
5. Korean is the learner's biggest asset. The two languages share SOV order, a particle system, a
   politeness verb-ending system and Sino-Korean vocabulary. The path should spend its time on what
   **differs**, not on what transfers.

Consequence: this is a *fluency and retrieval-speed* curriculum, not a vocabulary curriculum. The unit of
learning is the **chunk**, a ready-made utterance or frame such as 「〜でお願いします」. The kanji character is not the unit.

## 2. Design principles (opinionated)

- **Situations, not kanji lists.** Each unit is a real place or social task with a *win condition* the learner
  can check in real life.
- **Listen-heavy, produce-narrow.** Learners hear staff keigo (お預かりします, ご利用ですか) and only need to
  understand it. They must produce plain です/ます plus a few softeners. Every line is tagged `say` or `hear`.
- **Speed is the metric.** "Can I say it" is binary and lenient. "Can I say it before the other person gives
  up" is what matters in conversation, so the system measures **response-onset latency** locally.
- **Variation beats memorizing a script.** The cashier never says the line the same way twice, so
  listening turns branch among real variants.
- **Repair strategies come early.** 「もう一度お願いします」 and 「〜ってどういう意味ですか」 are taught in unit 2,
  not unit 12. They have the highest return of anything in the path.
- **Kanji is a sidecar.** It appears with furigana, and the hanja bridge helps meaning. Reading kanji is never tested in this path.

## 3. Unit map (16 units + a pronunciation clinic that runs alongside)

Notation: **Acts** = speech acts. **Say** = chunks the learner produces. **Hear** = listen-only lines.
**Win** = the real-life success criterion and the capstone role-play.

| # | Unit (KR title) | Acts | Say (examples) | Hear (examples) | Win condition |
|---|---|---|---|---|---|
| 1 | 인사와 맞장구 | greet, thank, apologize, acknowledge | おはようございます / すみません (3 uses) / どうも / はい・ええ / そうなんですね / なるほど / 大丈夫です | こんにちは / お疲れ様です | Open and close any exchange, and use すみません correctly as "excuse me", "sorry" and "thanks". |
| 2 | 못 알아들었을 때 (repair) | clarify, slow down, ask meaning | もう一度お願いします / ゆっくりお願いします / 〜ってどういう意味ですか / 日本語で何て言いますか / ちょっと分からないです / 〜ということですか | (fast variants of any line) | Recover three times in a row without switching to English or Korean. |
| 3 | 편의점 계산 | respond to service questions | はい、お願いします / 大丈夫です / 袋お願いします / カードで / これください / 温めてください | いらっしゃいませ / 温めますか / 袋はご利用ですか・お付けしますか / お箸おつけしますか / ポイントカードはお持ちですか / 〜円になります / 〜円お預かりします | Finish a konbini checkout and answer four staff questions with no 「え？」. |
| 4 | 숫자·가격·시간 | understand and say quantities | いくらですか / 〜つ / 〜枚 / 何時ですか / 〜時半 / 〜番 | 千二百八十円です / 三番線 / 五分後 | Catch a price and a time on first hearing at natural speed. |
| 5 | 카페·식당 주문 | be seated, order, modify, pay | 二人です / 〜をください / 〜でお願いします / おすすめは何ですか / 〜抜きでできますか / お会計お願いします / 別々でお願いします | 何名様ですか / 店内でお召し上がりですか / お持ち帰りですか / サイズはいかがなさいますか / 以上でよろしいですか | Get seated, order with one modification, split the bill. |
| 6 | 길·전철 | ask the way, confirm a route | 〜はどこですか / 〜までどうやって行けばいいですか / この電車は〜に止まりますか / 〜で乗り換えですか / 〜の近くですか | まっすぐ行って / 二つ目の角を右に / 〜線に乗り換えて / 次は〜 | Ask for and follow a two-step direction, and confirm a train stops at your station. |
| 7 | 자기소개·스몰토크 I | introduce self, answer the standard questions | 韓国から来ました / 〜と申します / 〜で働いています / 日本は〜回目です / 〜が趣味です / 〜さんは？ | どちらからですか / お仕事は何を / 日本語上手ですね | Give a 60-second self-introduction and answer five follow-ups, including deflecting 「上手ですね」 with 「いえいえ、まだまだです」. |
| 8 | 쇼핑·부탁·허락 | ask for availability, permission, request | 〜はありますか / 見てるだけです / 試着してもいいですか / 他の色はありますか / 〜にします / 〜てもらえますか | サイズはおいくつですか / こちらは〜になります / 在庫を確認します | Find an item, try it on, choose, pay. |
| 9 | 좋아하는 것·경험·의견 | state likes, experience, simple opinion | 〜が好きです / 〜たことがあります / どうでしたか / 〜と思います / けっこう〜 / まあまあです | 〜に行ったことありますか / どうでした？ | Talk for two minutes about a trip or food, with one follow-up question back. |
| 10 | 반말 전환 (친구) | switch register, casual reactions | うん / そうなんだ / まじで？ / 〜じゃん / 〜てる / 〜ちゃった / 〜よね | (casual versions of units 1–9) | Recast 20 polite lines into casual and hold a casual exchange with no slips into です. |
| 11 | 약속 잡기 | invite, suggest, refuse softly, fix details | 〜しませんか / 〜しない？ / 〜はどうですか / 〜はちょっと… / いつ空いてる？ / 〜で待ち合わせ / 何時にする？ | 今週末どう？ / ごめん、その日は… | Agree a date, time and place, and decline one proposal politely. |
| 12 | 전화·LINE | open a call, reserve, take a message, text | もしもし / 〜と申します / 予約したいんですが / 〜名で / 〜時に / 折り返しお願いします / 了解 / 今着いた / ちょっと遅れる | 少々お待ちください / お名前頂戴できますか / 〜はただいま席を外しております | Make a phone reservation: date, time, party size, name and number. |
| 13 | 문제 해결·병원·약국 | explain a problem softly, ask for remedy | 〜んですが / 〜が壊れてるみたいで / 〜を落としちゃって / 頭が痛いんです / 〜はありますか / どうすればいいですか | いつからですか / どうされました？ / こちらにご記入ください | Explain a problem with 〜んですが and get it resolved (pharmacy, wrong order, lost item). |
| 14 | 있었던 일 말하기 | narrate past events, sequence | それで / そしたら / 〜て、〜て / 〜んだけど / 結局 / びっくりした | え、それで？ / うそ！ | Tell a 90-second anecdote with three sequence markers. |
| 15 | 직장 기본 | greet at work, request, report, apologize | お疲れ様です / よろしくお願いします / 失礼します / 確認します / 〜ていただけますか / 〜の件ですが / 申し訳ありません | 〜させていただきます / 承知しました / 〜はどうなってる？ | Get through the morning greeting, ask a colleague for help, give a status report and leave the office correctly. |
| 16 | 맞장구·동의·반대 | agree, hedge, disagree softly, keep the floor | 確かに / そうですね…でも / 〜かもしれません / 〜じゃないですか / っていうか / 逆に | — | Hold a polite position through a three-minute discussion. |

Each unit has roughly 20–30 `say` chunks and 10–20 `hear` lines, about 450 `say` chunks in total. That covers
the core of A2 spoken interaction (JF Standard / CEFR A2 "everyday transactions"). Units 1–9 are the "survive
Japan" block. Units 10–16 are the "have relationships" block.

**Pronunciation clinic (side lane, 2 minutes a day, no units).** These targets are specific to Korean speakers:
- Word-initial voicing: か/が, た/だ (가/카 is not the same contrast). 「学校」 is がっこう; it is not かっこう.
- 長音 length: おばさん/おばあさん, ここ/こうこう.
- 促音 っ timing: きて/きって.
- ざ/じゃ and ず/じゅ (Korean speakers say じゅ for ず), and つ/ちゅ.
- Pitch on a few minimal pairs (はし/はし). Treat these for awareness only and never grade them.

Each one is a hear-and-discriminate multiple-choice item (1–4 keys) plus shadowing. It reuses the card types below.

## 4. Content unit types: what the learner does and what the system measures

| Type | Learner does | System measures | Feeds FSRS? |
|---|---|---|---|
| **A. Chunk card (cue → say)** | Sees a Korean intent cue plus a situation tag (「점원에게: 봉투는 필요 없다고」). Says the Japanese aloud (records, or mouths it in silent mode). Reveals the text and native audio, then compares. | Self-grade on three buttons (못함 / 막힘 / 바로). **Onset latency** from the reveal-ready moment to the first speech energy, measured on-device. Silent mode records no latency. | Yes, `say` state |
| **B. Listen → understand** | Hears a `hear` line at 1.0× with no text, then picks the intent from four options (1–4). Replay is allowed but counted. | First-attempt accuracy and replay count. A correct answer that needed 2+ replays is graded `hard`. | Yes, `hear` state |
| **C. Shadowing** | Plays a line and speaks over it 2–3 times. The existing `PASS_TARGET = 3` loop covers this. | Completion only. Optional speech-to-text diff later (scope-doc follow-up), shown and never graded. | No |
| **D. Response to prompt** | Hears a question, for example 「温めますか？」, and must reply within a soft timer. The system then reveals 1–3 attested acceptable replies. | Onset latency, plus a self-grade on whether the reply did the job, not whether it matched exactly. | Yes, on the reply chunk's `say` state when the reply maps to a chunk; otherwise none |
| **E. Role-play scene** | Plays a 4–8 turn scene. The system voices the other party and the learner's turns show only a Korean intent card. Pressing "힌트" reveals the chunk and counts as a miss. | Turns completed without a hint, median latency, and scene pass/fail. A pass requires no hints and every turn under 3 s; **this is the unit's win condition**. | No, but a miss pushes that chunk's `say` due date to today |
| **F. Branching listen-reply** | Within a scene, the other party's turn is drawn from 2–4 attested variants (袋いりますか / 袋はご利用ですか / レジ袋お付けしましょうか). The learner must reply appropriately to whichever one plays. | Correct handling per variant. Each variant is a separate `hear` item, so FSRS learns which phrasings are weak. | Yes, per variant `hear` state |
| **G. Say it your way (circumlocution)** | Gets a target concept with no chunk ("you forgot the word for receipt"). Explains it with known chunks (「お金を払ったときにもらう紙」). | Self-check plus duration spoken. Unscheduled; appears once per unit as a strategy drill. | No |

Measurement honesty: everything except B and F is self-graded. The UI must keep the wording of
`docs/learning-evidence.md`: "self-check is not verified pronunciation." Latency is the one objective signal
for speaking and needs no upload. Compute it from the `MediaStream` with a Web Audio `AnalyserNode` RMS
threshold, which matches the speaking-scope rule that no audio leaves the device.

## 5. Register, speed, fillers, aizuchi, contractions

- **Politeness ladder.** Units 1–9 produce only です/ます. Service keigo (尊敬/謙譲) is `hear`-only for the
  whole path, except for 〜と申します, 〜ていただけますか and 申し訳ありません, which carry high value as fixed
  chunks. Unit 10 brings in casual register through **register-pair cards**: the same intent with a polite and
  a casual target, and the situation tag decides which one counts. After unit 10, every scene declares its
  register (店員 → polite, 友達 → casual, 先輩 → polite with casual aizuchi). A wrong-register answer is
  graded 막힘 and is not treated as a miss.
- **Listening speed.** Playback offers 1.0× and 0.85× only; anything slower distorts the audio and trains the
  wrong ear. B and F always play first at 1.0×. Unit capstones disable 0.85×. Where real human audio exists
  (see sourcing), prefer it over TTS for `hear` lines because TTS loses natural reductions.
- **Fillers.** えーと, あのー, なんか, その… are taught as `say` chunks in unit 2. Their job is to buy time,
  and a filler counts as speech onset, so the latency metric rewards the learner for holding the floor.
  This is deliberate.
- **Aizuchi.** はい / ええ / うん / そうですね / なるほど / へえ / そうなんだ / ですよね start in unit 1 and come
  back in unit 10 (casual) and unit 16 (discussion). Add a scene mode where the other party tells a 30-second
  story with pauses and the learner must fill each pause with aizuchi; the system counts the pauses filled.
- **Real-speech contractions (hear first, then say from unit 10).**
  ている→てる, ておく→とく, てしまう→ちゃう/じゃう, なければ→なきゃ, のだ→んだ, では→じゃ, と言う→って,
  ている？→てる？, それは→そりゃ (`hear` only), ところ→とこ. Each gets a pair card: hear the contracted form
  and identify the full form (type B), and later produce it (type A).
- **〜んですが/〜んですけど** is the most useful softener for a Korean speaker. It works like 〜는데요. It gets
  its own drill thread in units 8, 12, 13 and 15.
- **Korean-transfer traps (explicit micro-cards).** 電車に乗る (기차를 타다), 友達に会う (친구를 만나다),
  〜が好き (〜를 좋아하다), 〜が分かる, 〜がほしい. Also 「〜してください」 overuse, where 〜てもらえますか is softer.
  The over-polite 「〜させていただきます」 is avoided in production.

## 6. Kanji and the hanja leverage (kept minimal)

- Every chunk shows kana as the primary text and kanji with furigana as secondary. Kanji reading is never tested in this path.
- **Hanja bridge chip.** When a chunk contains a Sino-Japanese word whose characters exist in the KR track,
  show the Korean reading inline: 予約(예약) よやく, 約束(약속) やくそく, 準備(준비) じゅんび, 確認(확인) かくにん.
  These come from existing seed data and need no new content. Meaning transfers instantly, so the learner's
  effort goes to the sound.
- **Sound-correspondence hints** (shown once per pattern, never drilled). Korean final ㄱ → く/き (학→がく,
  역→えき). ㄹ → つ/ち (일→いち, 발→はつ). ㅂ → う (합→ごう, 급→きゅう). ㅇ → う/い (상→しょう, 생→せい).
  ㄴ/ㅁ → ん. These let the learner *guess* the on'yomi of an unknown kango and say it, which is a real
  conversation skill.
- Cross-link one way: a chunk that contains kanji the learner has not mastered never blocks progress, and
  mastering a chunk gives no kanji FSRS credit. The tracks stay independent.

## 7. Progression, FSRS for chunks, placement

**Unlocking.** A unit unlocks when the previous unit's capstone scene has been *attempted*, even without a
pass, so a learner is never stuck. A unit counts as *complete* when its capstone passes (no hints, every turn
under 3 s). Completion is what the home screen shows.

**FSRS states.** Use the table `conv_review_states(profile_id, chunk_id, mode CHECK IN ('say','hear'), …same FSRS columns…)`.
Each `say` chunk has a `say` state. Each `hear` line and branch variant has a `hear` state. A chunk may have
both, for example aizuchi. The existing `shared/fsrs.ts` is reused unchanged.

**Grade mapping (speaking).**
- 못함 (needed reveal / said wrong thing) → `again`
- 막힘 (said it, but onset > 3.0 s, or wrong register, or a visible stumble) → `hard`
- 바로 (onset ≤ 3.0 s, right register) → `good`
- `easy` is never used. Fluency does not get "easy"; that state comes from stability.
- Latency **suggests** a grade, preselecting 막힘 when onset is over 3 s, and the learner can override it.
  In silent mode there is no latency, so the learner self-grades. The 3.0 s threshold is a heuristic and
  should be a calibration constant per profile, not a validated value.

**Session composition (≈15 min).** Due `hear` items come first because they are cheap, then due `say` items,
then up to 8 new chunks (cap 10), then one scene. The scene is either the current unit's practice scene or
an **integration review**: a completed unit's capstone replayed when 30% or more of its chunks are due. This
gives FSRS-driven scene review without scheduling scenes directly.

**Corrective re-attempt.** Reuse the existing `correctionQueue` pattern: a missed `say` chunk comes back once
about three cards later, ungraded.

**Placement (≈6 min, optional).** Run the capstone scenes for units 1, 3, 5, 7, 10 and 13 cold, without
teaching first. When a capstone passes, mark that unit and the units before it complete, and seed their
chunks as `Review` with a moderate stability (for example 7 days) so they get verified soon instead of
trusted forever. This mirrors the existing unit test-out concept (`curriculum_unit_test_attempts`).

**Real-world check-in.** Each unit's win condition appears as a checkbox, 「실제로 해봤다」, with an optional
one-line note. The app does not use it for scheduling. It exists because it is the only honest outcome measure.

## 8. Sample schedules (assumes 20 min/day, 6 days/week)

**4 weeks: "survive Japan"**
| Week | Units | Notes |
|---|---|---|
| 1 | 1, 2 + clinic (voicing, 長音) | Repair chunks reach FSRS review before anything else. |
| 2 | 3, 4 | Konbini capstone ends the week. Introduce the 0.85× → 1.0× habit. |
| 3 | 5, 6 | Branching variants appear in force (restaurant and station announcements). |
| 4 | 7 + integration review of 3–6 | Final day: placement-style run of capstones 1, 3, 5, 7. Mark any real-world wins. |

**12 weeks: through unit 16**
| Week | Units | Week | Units |
|---|---|---|---|
| 1 | 1, 2 | 7 | 11 |
| 2 | 3, 4 | 8 | 12 |
| 3 | 5, 6 | 9 | 13 |
| 4 | 7, 8 | 10 | 14, 15 (first half) |
| 5 | 9 | 11 | 15, 16 |
| 6 | **Review week**: capstones 1–9 cold, then 10 (casual switch) begins on day 4 | 12 | **Review week**: all capstones, register-mixing scenes, aizuchi story mode |

New-chunk load is about 35 per week (6 days × ≤8 new, minus scene days), roughly 420 by week 12. That is
about the size of the inventory in section 3.

## 9. Content sourcing: does the rule hold for dialogues?

**The problem.** Tatoeba gives single sentences, not dialogues. Many of its Japanese rows come from the Tanaka
corpus, which contains known unnatural student translations. Fixed service phrases (温めますか) are attested
everywhere but rarely appear as Tatoeba rows with a Korean translation. A strict "every line is a cited corpus
row" rule therefore cannot produce a branching konbini scene.

**Proposed position (defensible, keeps the spirit of the rule):**
1. **Japanese target text is never generated.** Every `say` and `hear` line must carry a `source_kind` +
   `source_ref` from the lanes below.
2. **Scene structure and Korean intent cues are instructional scaffolding**: the turn order and the line
   「점원에게: 봉투는 필요 없다고」. They are *authored*, not sourced, and are labelled `authored`. Who may draft
   them is a decision for the owner (see below).
3. **Gaps are recorded, not filled.** If a scene needs a line no lane attests, it ships with that turn missing
   and logged as a sourcing gap. This mirrors the "Remaining Korean gaps" practice in `SOURCES.md`.

**Lanes, from most to least redistributable:**

| Lane | What | License / caveat | Use for |
|---|---|---|---|
| A1. Tatoeba | Japanese sentences with linked Korean or English translations | CC BY 2.0 FR (some rows CC0). Filter to sentences **owned by self-declared native Japanese contributors**, prefer rows with audio, and drop known Tanaka-origin rows when a native alternative exists. | `say`/`hear` lines of general conversation (units 7, 9, 11, 14, 16) |
| A2. Tatoeba audio | Human recordings attached to sentences | **License is per contributor and some are non-commercial (NC).** Verify each one; NC is probably fine for a private solo app, but that is the owner's call. | Real-voice `hear` audio instead of TTS |
| A3. JMdict / EDRDG | `exp` (expression) entries such as お疲れ様です, いらっしゃいませ, 結構です | CC BY-SA 4.0. **Share-alike** may apply to the derived chunk file, so keep it as a separate data file with its own license header. | Fixed chunks and set phrases (units 1, 3, 5, 15) |
| A4. Wiktionary (ja) | Phrasebook-style entries and usage notes | CC BY-SA 4.0. The repo already uses Wiktionary for compounds. | Attesting service lines and casual contractions |
| A5. Mozilla Common Voice ja | Sentences + human audio | CC0 | Listening variety (many voices, real devices). The sentences skew literary, so use it mainly for clinic minimal pairs. |
| B1. Japan Foundation いろどり 生活の日本語 | A situational A1–A2 course with real-speaker dialogue audio: konbini, restaurant, trains, work, health | Free to download. **Redistribution and in-app terms must be verified with JF before any row is committed.** It fits this path best. | Units 3, 5, 6, 8, 12, 13, 15 scenes (license permitting) |
| B2. JF Standard / JF Can-do statements | A1–A2 Can-do descriptors | Cite them, don't copy them | Wording of the win conditions |
| C1. 名大会話コーパス / CEJC (NINJAL) | Real daily-conversation transcripts | Research license, no redistribution | **Statistics only**: rank chunk, filler and aizuchi frequency to order the inventory. No text enters the repo. |
| D1. Personal phrasebook | Lines the owner actually heard in Japan | The owner is the source; stays in the private profile | `source_kind: personal`, never seeded publicly |

**Audio.** The existing pipeline makes Google TTS clips for sourced text. That is synthesized audio of real
text, and I read it as consistent with the rule, but state that explicitly in `SOURCES.md`. Use human audio
(A2, A5, B1) where licensed, especially for `hear` lines and unit capstones.

## 10. Decisions needed from owner

1. **Assumptions in §1.** Confirm kana fluency, the current speaking level and that formal business keigo production is out of scope.
2. **Rule interpretation.** Is "Japanese text sourced, scene structure and Korean cues authored" acceptable? If so,
   who may draft the authored scaffolding: the owner only, or an LLM draft that the owner reviews line by line
   before commit? Japanese text stays non-generated either way.
3. **Owner-written Japanese.** May the owner add an unattested line as `source_kind: author` when a gap blocks a
   scene, or must the turn stay missing?
4. **License appetite.** Accept CC BY-SA share-alike on the chunk file (JMdict/Wiktionary)? Accept NC-licensed
   Tatoeba audio for a private app? Contact JF about いろどり terms?
5. **Personal-use licensed data.** May material licensed only for personal use live in private R2 or D1 and stay
   out of git, or is it excluded entirely?
6. **Placement in the product.** Should this become a fourth tab (「회화」), a mode inside the JP tab, or the
   default JP experience with kanji as the side lane?
7. **Grading.** Three self-grade buttons plus a latency suggestion, with a 3.0 s default threshold. OK? Silent mode allowed?
8. **Speech-to-text.** Keep it out until the scope-doc evaluation is done (my recommendation), or bring the
   transcript-diff experiment forward for type C and G cards?
9. **Unit order.** Repair is placed at unit 2 and casual register at unit 10. Should the owner's real
   priorities, such as moving workplace earlier, reorder these?
10. **Daily budget.** Default to 15 or 25 minutes; this changes the new-chunk cap (8 vs 12).

## 11. Suggested Codex implementation slices (small, independently shippable)

Each slice ships alone and keeps the existing tracks untouched.

1. **Decision record**: add `docs/conversation-path.md` (unit map, card types, grading) and a
   "Conversation lanes" section in `data/SOURCES.md` that records the owner's §10 answers. No code.
2. **Schema + seed validator**: a new migration adds `conv_units`, `conv_chunks(id, unit_id, ord, ja, kana,
   ko_cue, register CHECK IN ('polite','casual','keigo'), role CHECK IN ('say','hear'), source_kind, source_ref,
   audio_key)`, `conv_scenes` and `conv_scene_turns(scene_id, ord, speaker, chunk_ids JSON for variants)`.
   Extend the seed script to validate a `{ "conversationUnits": [...] }` file (exact `source_ref` required
   unless `authored`). Test: seeding fails on a missing source.
3. **Pilot content: unit 2 (repair) only**, around 20 chunks, sourced through lanes A1/A3/A4, with a list of gaps.
   Data-only PR.
4. **Read API**: `GET /api/conversation/units` and `GET /api/conversation/units/:id` (chunks + scenes). Worker tests.
5. **Phrase FSRS**: the `conv_review_states` table and `POST /api/conversation/reviews {chunkId, mode, grade,
   answeredAt}`, reusing `shared/fsrs.ts`, the outbox and answer-time semantics. Test: grade → due date.
6. **On-device onset latency**: add `measureOnset(stream)` in `speech.ts` using `AnalyserNode` RMS. It returns
   ms or null and sends no network traffic. Test with a synthetic buffer (silence, then tone).
7. **Chunk card screen (type A)**: Korean cue → record/silent → reveal + audio → 못함/막힘/바로, with keys 1–3
   and a latency-preselected grade. It reuses `LocalRecorder`.
8. **Listen card (type B)**: audio-only with a four-option intent choice, a replay counter and the `hear` grade mapping.
9. **Audio generation for chunks**: extend `npm run audio:generate` to produce chunk keys. Add a 1.0/0.85 playback toggle.
10. **Conversation home**: a unit list with situation titles, the win condition and capstone status under the JP
    tab (or wherever decision 6 lands). Calm list layout, no path-map nodes.
11. **Scene runner (type E)**: linear 4–8 turn scenes with hints, per-turn latency and a pass rule. A miss pulls
    that chunk's due date to today.
12. **Branching variants (type F)**: a random variant for each other-party turn, with a `hear` state per variant.
13. **Session composer**: due `hear` → due `say` → new (cap) → one scene, plus the integration-review trigger
    (≥30% of a unit's chunks due). Unit-tested pure function in `shared/`.
14. **Placement via capstones**: cold runs of capstones 1/3/5/7/10/13, then mark completion and seed stability.
15. **Register-pair cards + contraction pairs**: data shape (`pair_id`) and card variants.
16. **Hanja bridge chip**: map kanji words in a chunk to KR readings from existing character data. Display only.
17. **Pronunciation clinic lane**: minimal-pair discrimination items (type B UI) for voicing, 長音, っ, ず/じゅ.
18. **Real-world check-in + personal phrasebook**: a win-condition checkbox with a note, and private
    `source_kind: personal` chunks entered by the owner.
19. **Content fill**: units 1, 3–16 as one data PR each, each gated by slice 2's validator and the gap log.
