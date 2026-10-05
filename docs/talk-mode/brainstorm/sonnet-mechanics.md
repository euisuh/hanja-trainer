# Japanese conversation speaking path: mechanics and technical feasibility

Author angle: interaction loops, feedback honesty/cost, audio, D1 model, metrics, risks.
Status: brainstorm only, no code changed. Costs are order-of-magnitude list prices from memory; re-verify before committing (marked ~).

## 0. What the repo already gives us (grounding)

| Fact | Where |
|---|---|
| Record-and-compare exists for jp/cn sentence cards: `getUserMedia` + `MediaRecorder`, 15 s cap, in-memory only, tracks stopped on every exit, denied/unsupported states | `src/features/study/speech.ts` (`LocalRecorder`, `MAX_RECORDING_MS`), `src/screens/SpeakingScreen.tsx` |
| Reference audio: R2 `AUDIO` bucket, keys `jp/s{TatoebaId}.mp3`, served by `GET/HEAD /api/audio/(kr\|jp\|cn)/{key}.mp3`, key regex only allows 1-char or `s\d+` | `worker/audio.ts` (`audioObjectKey`), `wrangler.jsonc` |
| Audio is pre-generated offline with Google Cloud TTS (`ja-JP-Neural2-B`), skip-if-exists via `HEAD` | `scripts/generate-audio.ts` |
| Fallback chain: cached mp3, then Web Speech `speechSynthesis` | `SpeakingScreen.tsx` `playReference` |
| Speaking practice is explicitly outside FSRS/XP/streaks today; STT experiment is specified (Worker endpoint, Chirp 3, no storage, transcript diff only, no pronunciation claims) | `docs/speaking-practice-scope.md` |
| FSRS: pure `schedule(state, grade, now)` over a `ReviewState`; Worker owns scheduling; reviews idempotent on `(profile, session, cardIndex)` | `shared/fsrs.ts`, `worker/db/reviews.ts`, `docs/mobile-roadmap.md` rules |
| Schema conventions: `profile_id ... REFERENCES profile(id) ON DELETE CASCADE`, `track CHECK IN ('kr','jp','cn')`, epoch-ms INTEGER, `json_valid` CHECKs, idempotency tables keyed by client-generated ids, composite indexes led by `profile_id`, append-only migrations, next number is `0025` | `migrations/0001,0002,0017,0024` |
| Generic offline outbox with durable native mirror (Capacitor Preferences) | `src/features/session/outbox.ts` (`createOutbox`), `src/platform/storage.ts` |
| iOS has `NSMicrophoneUsageDescription`; no `NSSpeechRecognitionUsageDescription`. Android has `RECORD_AUDIO` | `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml` |
| `@capacitor/*` imports are confined to `src/platform/` and `src/main.tsx` | `docs/mobile-roadmap.md` rules |
| Product rule: "Real corpus/textbook example sentences only, no AI-generated content" | `README.md` line 12 |
| Content today is Tatoeba single sentences keyed to a kanji, not dialogue | `data/sentences/*.json` |

Key implication: the conversation path cannot hang off `character_tracks` (every existing FSRS FK is `(character_id, track)`). It needs its own content and state tables that reuse `shared/fsrs.ts` unchanged.

Rule that conflicts with the idea: "no AI-generated content". Decision D1 below.

---

## 1. Interaction loops

Common conventions for all loops:
- Keyboard-first, matching `SpeakingScreen`: Space = play reference, R = record toggle, Enter = next/confirm, 1-4 = self-rating, Esc = exit.
- Mic permission requested only on first Record press (existing scope rule).
- One utterance cap 15 s (reuse `MAX_RECORDING_MS`); NPC lines have no cap.
- Never overlap playback and recording. Play, then arm mic. (iOS audio-session switching, echo, and the NPC voice leaking into the learner clip.)
- Every loop emits one `attempt` event per learner utterance (section 4) into an outbox; recordings are never queued or uploaded unless the learner explicitly triggers STT, and then the body is deleted server-side after recognition.

### Loop 1: Listen and repeat / shadowing

Unit: one chunk (a 2-8 mora to ~20-char useful phrase, e.g. `ちょっと待ってください`).

States: `loading` > `ready` > `playing_ref` > `armed` (mic ready, waiting for onset) > `recording` > `review` > (`feedback`) > `rated` > next.

Steps:
1. Show text (kanji + furigana toggle, Korean gloss, register badge). Reference auto-plays once at 1.0x; a "slow" button plays 0.75x variant.
2. Two sub-modes, chosen per attempt by chunk familiarity:
   - Echo: play, then immediately arm the mic; learner repeats. Onset detection starts the recording timer. Max 3 passes (existing `PASS_TARGET`).
   - Shadow: reference plays while text highlights mora by mora; learner speaks over it. Headphones strongly recommended (detect via `enumerateDevices` label is unreliable; just show a one-time hint). Recording is NOT used in shadow on speaker output (leaks reference); shadow is untracked-quality practice, rated by self only.
3. `review`: replay own clip A/B against reference (two buttons, A/B toggle, same loudness normalization not attempted v1).
4. Self-rating: 4 buttons mapped to Again/Hard/Good/Easy with Korean labels ("전혀 못함 / 겨우 / 괜찮음 / 자연스러움").
5. Optional "check transcript" button if STT enabled (Loop-agnostic, section 2).

Inputs: voice (primary), tap/keyboard for control. Timing: no timeout; idle 60 s on `armed` returns to `ready` and releases the mic.

Failure/empty: permission denied (explain how to re-enable per platform; practice continues listen-only with self-rating "listened only" that does NOT schedule FSRS); unsupported (listen-only); no audio clip for chunk (Web Speech fallback, labeled "기기 음성"); silence detected (peak RMS under threshold): "소리가 안 잡혔어요", does not count as an attempt.

Offline: fully works if the scene audio pack is cached (section 3); attempts queue in the outbox. Self-compare needs nothing from network.

### Loop 2: Prompt to spoken response drill

Unit: a situation cue; learner must produce a target chunk from meaning, not from the written Japanese. This is the FSRS review loop (productive recall).

States: `cue` > `thinking` (latency timer running) > `armed/recording` > `reveal` > `compare` > `rated`.

Steps:
1. Cue card: Korean situation line ("카페에서 점원이 '여기서 드세요?'라고 물었을 때 '포장이요'") plus optional image/icon; or NPC audio line. No Japanese text shown.
2. Timer starts at cue end. Learner may press "Hint" (reveals first mora/kana, then full text); hints are logged and cap the rating at Good, 2 hints cap at Hard.
3. Learner speaks. Onset time recorded (RMS threshold via `AnalyserNode` on the same stream) so `latency_ms` = onset minus cue end. This is the fluency signal.
4. Reveal: show target text + reference audio; replay own clip; list `accepted_variants` (e.g. `持ち帰りで` vs `テイクアウトで`) so valid alternatives are not "wrong".
5. Self-rating 1-4. If STT transcript present, show it as a hint beside the rating buttons; never auto-rates.
6. Again = chunk re-queued later in the same session (reuse `correctionQueue` pattern, `src/features/session/correctionQueue.ts`).

Timing: soft 8 s "thinking" prompt ("포기하고 정답 보기"); hard none. Session size 10-15 prompts, due chunks first then new.

Failure/empty: no due chunks > "오늘 복습할 말하기 없음" with link to a new scene; mic denied > "say it in your head" mode (type-to-skip, tap "말했다/못했다"); this fallback is lower fidelity and should be flagged in the attempt (`input = 'tap'`) and excluded from latency metrics.

Offline: works; ratings apply when the outbox flushes. Scheduling timestamps come from the client answer time (existing offline-review-time rule in README).

### Loop 3: Branching role-play dialogue (app speaks, learner replies)

Unit: a scene graph (`conv_nodes`/`conv_edges`).

States per turn: `npc_speaking` > `learner_turn` > (`listening/recording`) > `branch_resolve` > `npc_speaking` ... > `scene_end` > `debrief`.

Steps:
1. Intro screen: setting, goal ("커피 주문하고 계산하기"), register, NPC voice. Preload all audio for the scene (Loop-3 refuses to start if more than N clips are missing and offline).
2. NPC line plays (cached mp3, 1.0x; "slow" and "repeat" buttons available at no penalty but logged as `replays`).
3. Learner turn has three assist levels the learner picks per scene: Guided (3 option chips each a chunk; tap one to pick intent, then speak it), Prompted (Korean intent line only, as in Loop 2), Open (just NPC line, say anything sensible).
4. Resolution: learner's branch is picked by what they chose (Guided) or by self-selection after speaking (Prompted/Open: "어떤 응답이었나요?" shows 2-4 edge labels). v1 does NOT infer the branch from STT; it is too unreliable and keeps determinism and testability. v2 may auto-suggest the edge when STT confidence is high.
5. Each learner turn yields an attempt linked to `chunk_id` when the picked edge has one, so FSRS credit flows to chunks, not the scene.
6. Debrief: transcript of the whole run (NPC lines + chosen edges + learner self-ratings), "rerun with fewer hints", list of chunks to add to review (ones rated Again/Hard).

Dead ends (a graph must always terminate): every node has a `default_next` and every scene has a max depth (about 12 turns) enforced by a build-time validator script.

Failure/empty: NPC audio 404 > fall back to Web Speech and mark node `degraded`; mic denied > Guided mode with tap-only (counts as comprehension practice, not speaking: `input='tap'`, excluded from speaking metrics); scene content missing > error + retry like `SpeakingScreen`.

Offline: works if the pack is cached; run state lives in memory, written to the outbox at each turn so an app suspension (iOS purges, see `docs/mobile-roadmap.md` phase 3) doesn't lose a half run.

### Loop 4: "Say it your way" free production with self-rating

Unit: a goal, no target ("비 때문에 약속을 미루고 싶다. 말해 보세요.").

States: `goal` > `recording` > `review` > `compare_models` > `self_rate` > (`optional_feedback`).

Steps:
1. Show goal + register + (optional) 3 key words. Learner records up to 15 s, can redo before submitting.
2. After recording, reveal 2-3 model answers (casual, polite, one natural alternative) with audio. Learner compares their clip to the models.
3. Self-rating on a different rubric than Loops 1-2 (honest for free speech): 3 axes of 1-3 each: "뜻이 통했을까" (got my meaning across), "자연스러웠나" (natural), "막히지 않았나" (fluent / no long pauses). Plus a mandatory tag "가져다 쓴 표현" picking chunks from the models they will steal. Tagged chunks are inserted into `conv_chunk_states` as new cards (due now): this is how free speech feeds the scheduler.
4. Optional opt-in LLM check (section 2, option D) on the transcript only.

No FSRS grade is produced by free speech; only the stolen chunks are scheduled. This keeps free practice from poisoning scheduler data with unfalsifiable self-grades.

Failure/empty: no STT/LLM available > steps 1-3 still complete; models missing > scene not shippable (content validator requires >= 2 models).

Offline: fully works minus optional step 4.

### Loop 5: Scenario replay / review

Unit: a past `conv_run`.

Steps: 
1. Run history per scene: date, assist level, hints, avg latency, min-rated chunk. 
2. "Replay with changed conditions" (the transfer test): same scene, one of (a) lower assist level, (b) swapped register (polite to casual NPC; `register_variant` nodes), (c) shuffled NPC line variant (`variant_group` on NPC nodes: alternate NPC phrasings), (d) time pressure (4 s response window). 
3. "Due scenes" on Home: a scene is surfaced when >= 3 of its chunks are due (derived, no per-scene FSRS card). Tapping runs Loop 3 in Prompted mode and ratings go to chunks.
4. Own-voice archive: NOT stored (privacy rule inherited from `docs/speaking-practice-scope.md`). Replay shows the structured record (what you chose, how you rated), not audio. If the owner wants audio replay, it is an explicit decision (D6).

Failure/empty: scene retired (content versioning): run history keeps `scene_version`; replay offers the current version.

Offline: reading history needs the last-synced snapshot; allow replay of any cached scene.

---

## 2. Feedback options, ranked by honesty and cost

Ranking principle: the earlier the option, the less it can mislead.

### A. Self-compare recording (ship first)
- What: learner hears own clip vs reference, A/B.
- Accuracy: no claim; the learner is the judge. Known weakness: novices are poor judges of their own pitch accent and vowel length; mitigate with a one-line checklist per chunk ("long vowel in おはよう", "double consonant in ちょっと") stored as `focus_note` on the chunk. 
- Latency/cost: 0. Privacy: clip never leaves the device (matches existing scope doc).
- Plug-in: existing `LocalRecorder`; needs the mime-selection fix (section 6).
- Do NOT claim: any score, "good pronunciation", "native-like".

### B. STT transcript diff (the first "machine" feedback)
Providers:
| Option | Japanese quality (relative) | Latency (5 s clip) | Cost ~ per learner-hour of attempts* | Notes |
|---|---|---|---|---|
| Google STT V2 Chirp 3 (`ja-JP`) | good | ~1-2 s sync `Recognize` | ~$0.016/min audio = ~$0.3 only if all 60 min recorded; realistic 120 clips x 5 s = 10 min = ~$0.16 | Already scoped in `docs/speaking-practice-scope.md`; needs service-account JWT signing in a Worker (WebCrypto RS256) or a GCP proxy |
| OpenAI `gpt-4o-mini-transcribe` / `whisper-1` | good, but hallucinates on silence/short clips | ~1-2 s | ~$0.003-0.006/min = ~$0.03-0.06 per 10 min | Simplest HTTP from a Worker (multipart); accepts webm/mp4/m4a |
| Workers AI `@cf/openai/whisper-large-v3-turbo` | ok | ~1-3 s | ~$0.0005/min (~) | No new vendor or credentials: add an `AI` binding to `wrangler.jsonc`. Cheapest; verify ja quality on our test set before choosing |
| On-device iOS `SFSpeechRecognizer` (`ja-JP`, `requiresOnDeviceRecognition`) | decent for common phrases | near real time | $0 | Needs `NSSpeechRecognitionUsageDescription`; a Capacitor plugin (e.g. a community speech-recognition plugin) in `src/platform/`; mic contention with `MediaRecorder` so in practice STT-only OR record-only per attempt on native |
| On-device Android `SpeechRecognizer` (`createOnDeviceSpeechRecognizer` API 33+, offline pack must be installed) | decent | near real time | $0 | Default `SpeechRecognizer` may send audio to Google; do not describe it as offline unless on-device is forced and verified. Behavior varies per device/OEM |
| Browser Web Speech `SpeechRecognition` | unavailable in iOS WKWebView; Chrome sends audio to Google | n/a | n/a | Do not rely on it |
*Prices ~, verify. Realistic attempt count assumes 120 recorded utterances per hour of practice, ~5 s each.

Honest limits for Japanese:
- Language-model bias: STT "corrects" a mispronounced but plausible phrase into the right text. A transcript match is evidence of machine-intelligibility, NOT of correct pronunciation or pitch accent. A mismatch can also be the recognizer's fault (short clips, noise, loanword kana vs kanji output).
- Orthography: output is kanji-mixed; `今日` vs `きょう` vs `キョウ`, numerals (`3`, `三`, `さん`), long vowel marks, punctuation, spacing. Needs normalization before diff.
- Pitch accent, vowel devoicing, geminates, long/short vowel: largely invisible to STT. Homophone pairs (橋/箸) cannot be told apart by sound alone.
- Very short utterances (1-2 words, <1 s) have the worst accuracy; Whisper-family models emit hallucinated text on silence ("ご視聴ありがとうございました").
- Child/accented/soft voice: unmeasured; scope doc already requires a labeled test set first.

Design: shared pure function `shared/speechDiff.ts`: NFKC normalize, strip punctuation/space, katakana to hiragana, optional per-chunk `accepted_forms` list (kanji form, kana form, casual/polite variants); character-level Levenshtein; output `{ similarity: 0..1, ops: Array<keep|sub|ins|del> }`. UI highlights diff text only. No threshold pass/fail; use three labels: "거의 같음 (>=0.9)", "일부 다름", "인식 안 됨". Unit-test with a table of normalizations (shared/ has the vitest/node:test pattern, `shared/kana.ts` already exists for kana conversion; reuse it).

Worker endpoint: `POST /api/speech/transcribe` in a new `worker/api/speech.ts` registered in `worker/api/router.ts`.
- Auth: normal profile session (cookie/bearer); same `crossSite` rejection.
- Body: raw audio bytes, headers `content-type` (allowlist: `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/wav`), `x-hanja-duration-ms`.
- Limits: <= 300 KB, <= 15 s, per-profile daily seconds cap (table `conv_stt_usage`), per-profile concurrency 1, 429 with the existing `error(status, code, message, retryAfter)` shape.
- Provider call; response `{ transcript, confidence|null, provider }`; body discarded; transcript returned, never persisted (unless D6).
- Compat: additive; no `API_COMPAT_VERSION` bump.
- Kill switch: `env.SPEECH_ENABLED`; client treats 503 as "feedback unavailable" and keeps Loop usable.

Do NOT claim: pronunciation score, accent rating, "you sound native", "correct/incorrect" as absolute. Copy: "기계가 알아들은 문장" (what a machine heard), not "발음 점수".

### C. Pitch-accent visualization
- Reference side (cheap, honest): show the dictionary accent pattern per chunk as a mora line with a high/low overlay (heiban, atamadaka, nakadaka, odaka). Data from an accent dictionary dataset (e.g. Kanjium accents, Wiktionary-derived; licensing is CC BY-SA-class, so attribution and share-alike implications need checking; decision D5). Phrase-level accent for multi-word chunks is not simply concatenation of word accents (accent phrase, downstep rules), so for chunks store a hand-authored `pitch_pattern` string (e.g. `LHHHL`) rather than computing it.
- Learner side (F0 contour): feasible in browser with Web Audio (YIN/autocorrelation, ~20 lines or `pitchy`), drawn as a line over a reference contour extracted offline from the reference mp3. Phone mics, AGC, and noise cause octave jumps and dropouts; male/female baseline differs so only normalize by the clip's median F0 and show shape. Expect it to look wrong often.
- Ranking: ship reference pattern display (v1.5), defer contour overlay behind an "experimental" flag.
- Do NOT claim: that a matching curve means correct accent, or score it. Also warn: Google Neural2 TTS can mis-accent homophones or rare words; the shown `pitch_pattern` should come from the dictionary/author, and the TTS clip must be spot-checked by a native speaker for chunks where accent is the focus.

### D. LLM-judged appropriateness (opt-in, free speech only)
- Input: transcript (text only, from B) + scene context + intended communicative function + register. Output: JSON `{ understood: bool, register_ok: bool, natural_alternatives: string[], note_ko: string }`. Model class: small/fast Claude (e.g. Haiku-tier) via Worker `fetch` with `ANTHROPIC_API_KEY` secret and a structured-output schema.
- Cost: ~120 free-speech judgments/hour x (~700 in + ~150 out tokens) = on the order of $0.15-0.30 per learner-hour at small-model pricing (~; verify with current pricing). Latency ~1-2 s plus STT time, so total ~3-4 s per attempt; acceptable only in Loop 4 debrief, not mid-dialogue.
- Privacy: only transcript text leaves, not audio; still needs a consent line and "no retention" provider setting.
- Honesty limits: judges text, not sound; can be wrong about naturalness and register nuance (keigo, regional), and is prone to praising. Constrain to "what a Japanese listener would likely understand" and "alternatives", never a numeric grade. Cache by hash of (scene, transcript) to cap spend.
- Conflicts with the README's "no AI-generated content" only if its output is stored as learning content; as ephemeral feedback it is separate (D1).
- Do NOT claim: "grammatically correct", "native-natural", "polite enough for your boss".

### E. Recommendation
1. v1: A only (extend what exists) + self-rating + FSRS. Zero cost, zero privacy delta.
2. v2: B via Workers AI whisper (cheapest, no vendor) or Chirp 3 (already designed), chosen by the labeled test set the scope doc already requires. Diff only.
3. v3: D for free speech, opt-in; C reference pattern.
4. On-device STT only for offline feedback, after v2 proves feedback is worth having.

---

## 3. TTS and reference audio

| Source | Naturalness | Cost | Licensing | Fit |
|---|---|---|---|---|
| Existing Tatoeba-keyed Neural2 mp3s | fine, flat prosody, single female voice | already paid | Google Cloud TTS output; check terms for redistribution inside a public store app (D5) | works for chunks derived from sentences; NPC and learner roles both sound the same |
| Google Cloud TTS Chirp 3: HD voices (ja-JP; several named voices) | noticeably more natural | ~$30 per 1M chars (~) | same as above | recommended for new dialogue; characters per scene ~300-600, so a 100-scene library is ~$1-2 total |
| Azure `ja-JP-NanamiNeural` / `KeitaNeural`, ElevenLabs, Gemini TTS | good to very good; styles (cheerful, polite) | comparable or higher | each has its own redistribution/commercial terms | a second vendor only if Google voices disappoint native review |
| Web Speech `speechSynthesis` | varies by device (iOS Kyoko/Otoya good; Android depends on engine) | free, offline | n/a | keep as last-resort fallback only; cannot be cached or normalized; inconsistent speed controls |
| Native speaker recordings (freelancer or friend; Tatoeba contributor audio where licensed) | best, correct accent and rhythm | per-clip fee (~) | contract gives full redistribution rights; Tatoeba audio is per-recording licensed (often CC BY) so attribution per clip is required | gold standard for the first 20-30 scenes' key lines; TTS for the rest |

Recommendation: Chirp 3 HD with two voices (one female, one male; casual/polite lines both from the same speaker per scene, for consistency) for all scenes. Owner/native friend records the ~200 highest-value chunks; recordings override TTS by key. Native review pass on every TTS clip before shipping (accent errors on homophones are the main risk).

R2 caching plan (extends `worker/audio.ts` and `scripts/generate-audio.ts`):
- Key scheme with content hash so regeneration never needs invalidation and caching is immutable: `jp/c/{sha1(voice|speed|text)[0:16]}.mp3`. `audioObjectKey` needs a third regex branch (`^c/[0-9a-f]{16}$`); tests live in `worker/audio.test.ts`. Chunk and node rows store `audio_key`.
- `cache-control: public, max-age=31536000, immutable` for hashed keys (current default is 86400 for others).
- Slow variant = separate generated key via SSML `<prosody rate="0.75">` (or TTS `speakingRate`), stored in `audio_key_slow`.
- Generator: new `buildConversationAudioEntries()` beside `buildSentenceAudioEntries`, same `HEAD`-skip; run as `npm run audio:generate:conv`.
- Native-recorded files uploaded with the same key scheme via a small script; the content hash is of the file bytes in that case, stored in the row.
- Scene audio pack: `GET /api/conv/scenes/:id` returns node list with `audioUrl`s; the client pre-fetches them on "download for offline". Offline storage on web: Cache API; on native: Capacitor Filesystem (new dep, only in `src/platform/`) because Cache API in `capacitor://` is not something to bet on. A scene is typically <= 30 clips x ~10-25 KB = under 1 MB.
- Audio needs no CORS (existing README note: media elements), but `fetch` into Filesystem/Cache does; if the pack download is `fetch`-based, the native origins CORS allowlist already covers `/api/*` JSON; confirm audio route is covered or download via the media element path.

---

## 4. Data model sketch (migration `0025_conversation_core.sql`, later `0026_conversation_runs.sql`)

Conventions followed: epoch-ms INTEGER, `profile_id` FK cascade, CHECK enums, JSON with `json_valid`, unique idempotency keys, profile-led indexes. Prefix `conv_` to keep it separate from kanji tables. `track` kept as `CHECK (track IN ('jp'))` so it can widen to 'kr'/'cn' without redesign.

```sql
PRAGMA foreign_keys = ON;

-- Content (global, seeded from data/conversation/*.json like sentences)
CREATE TABLE conv_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track TEXT NOT NULL DEFAULT 'jp' CHECK (track IN ('jp')),
  text TEXT NOT NULL,
  reading TEXT NOT NULL,                       -- hiragana, drives furigana and diff normalization
  translation_ko TEXT NOT NULL,
  register TEXT NOT NULL CHECK (register IN ('casual','polite','keigo','neutral')),
  function_tag TEXT NOT NULL,                  -- 'order','ask_repeat','decline','apologize',...
  accepted_forms TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(accepted_forms)),
  pitch_pattern TEXT,                          -- hand-authored 'LHHHL' or NULL
  focus_note_ko TEXT,
  audio_key TEXT,                              -- 'jp/c/<hash>.mp3'
  audio_key_slow TEXT,
  level_ord INTEGER NOT NULL CHECK (level_ord > 0),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('corpus','textbook','authored_reviewed')),
  source TEXT NOT NULL,                        -- attribution: 'Tatoeba #123' or reviewer id
  UNIQUE (track, text)
);

CREATE TABLE conv_scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track TEXT NOT NULL DEFAULT 'jp' CHECK (track IN ('jp')),
  slug TEXT NOT NULL UNIQUE,
  title_ko TEXT NOT NULL,
  setting_ko TEXT NOT NULL,
  goal_ko TEXT NOT NULL,
  register TEXT NOT NULL CHECK (register IN ('casual','polite','keigo')),
  level_ord INTEGER NOT NULL CHECK (level_ord > 0),
  ord INTEGER NOT NULL CHECK (ord > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (track, level_ord, ord)
);

CREATE TABLE conv_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL REFERENCES conv_scenes(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                           -- stable id inside the scene ('open','order','pay')
  speaker TEXT NOT NULL CHECK (speaker IN ('npc','learner')),
  chunk_id INTEGER REFERENCES conv_chunks(id), -- NPC line or learner target
  cue_ko TEXT,                                 -- intent shown in Prompted mode
  variant_group TEXT,                          -- alternates the NPC may say
  default_next TEXT,                           -- node key; NULL only on terminal nodes
  is_terminal INTEGER NOT NULL DEFAULT 0 CHECK (is_terminal IN (0,1)),
  UNIQUE (scene_id, key)
);

CREATE TABLE conv_edges (                       -- learner choices at a learner node
  node_id INTEGER NOT NULL REFERENCES conv_nodes(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL CHECK (ord > 0),
  label_ko TEXT NOT NULL,
  chunk_id INTEGER REFERENCES conv_chunks(id), -- the phrase this branch trains
  to_node_key TEXT NOT NULL,
  PRIMARY KEY (node_id, ord)
);

CREATE TABLE conv_scene_chunks (                -- index: which chunks a scene teaches (scene unlock, due-scene query)
  scene_id INTEGER NOT NULL REFERENCES conv_scenes(id) ON DELETE CASCADE,
  chunk_id INTEGER NOT NULL REFERENCES conv_chunks(id) ON DELETE CASCADE,
  PRIMARY KEY (scene_id, chunk_id)
);
CREATE INDEX idx_conv_scene_chunks_chunk ON conv_scene_chunks(chunk_id, scene_id);

-- Learner state: same columns as review_states so shared/fsrs.ts is reused untouched
CREATE TABLE conv_chunk_states (
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  chunk_id INTEGER NOT NULL REFERENCES conv_chunks(id) ON DELETE CASCADE,
  stability REAL NOT NULL, difficulty REAL NOT NULL,
  elapsed_days INTEGER NOT NULL, scheduled_days INTEGER NOT NULL,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL, lapses INTEGER NOT NULL, state INTEGER NOT NULL,
  last_review INTEGER, due INTEGER NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, chunk_id)
);
CREATE INDEX idx_conv_chunk_states_due ON conv_chunk_states(profile_id, due);

-- Event log: one row per learner utterance or rated card; idempotent
CREATE TABLE conv_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  client_attempt_id TEXT NOT NULL CHECK (length(client_attempt_id) BETWEEN 1 AND 128),
  run_id TEXT CHECK (run_id IS NULL OR length(run_id) BETWEEN 1 AND 128), -- client-generated scene run id
  scene_id INTEGER REFERENCES conv_scenes(id),
  scene_version INTEGER,
  node_key TEXT,
  chunk_id INTEGER REFERENCES conv_chunks(id),
  loop TEXT NOT NULL CHECK (loop IN ('echo','shadow','drill','roleplay','free')),
  assist TEXT NOT NULL DEFAULT 'none' CHECK (assist IN ('none','guided','prompted','open')),
  input TEXT NOT NULL CHECK (input IN ('voice','tap','keyboard')),
  answered_at INTEGER NOT NULL,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),   -- cue end to voice onset
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  hints INTEGER NOT NULL DEFAULT 0 CHECK (hints >= 0),
  replays INTEGER NOT NULL DEFAULT 0 CHECK (replays >= 0),
  self_grade INTEGER CHECK (self_grade IS NULL OR self_grade BETWEEN 1 AND 4),
  self_axes TEXT CHECK (self_axes IS NULL OR json_valid(self_axes)),  -- free speech {meaning,natural,fluent}
  stt_similarity REAL CHECK (stt_similarity IS NULL OR stt_similarity BETWEEN 0 AND 1),
  scheduled INTEGER NOT NULL DEFAULT 0 CHECK (scheduled IN (0,1)),   -- whether this attempt moved FSRS
  scheduled_days_before INTEGER, scheduled_days_after INTEGER,
  UNIQUE (profile_id, client_attempt_id)
);
CREATE INDEX idx_conv_attempts_profile_time ON conv_attempts(profile_id, answered_at);
CREATE INDEX idx_conv_attempts_chunk ON conv_attempts(profile_id, chunk_id, answered_at);
CREATE INDEX idx_conv_attempts_run ON conv_attempts(profile_id, run_id);

-- STT budget, per profile per local day
CREATE TABLE conv_stt_usage (
  profile_id INTEGER NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                           -- 'YYYY-MM-DD' in profile.timezone
  seconds INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  PRIMARY KEY (profile_id, day)
);
```
Transcripts and audio are deliberately not columns. `stt_similarity` is the only machine output stored, and is nullable.

Idempotency: the attempt insert is `INSERT ... ON CONFLICT (profile_id, client_attempt_id) DO NOTHING`; the chunk state update happens only when the insert actually wrote a row (use `meta.changes` in the same `DB.batch`), mirroring the keyed-summary approach of `0024_idempotent_session_summaries.sql`. Because offline queued attempts can arrive late, reuse the README's offline-review-time rule: apply the late event to the current state without moving `last_review` backward.

Migration testing: follow `worker/db/migrations.test.ts` and `worker/db/sessionSummaryMigration.test.ts` patterns (fresh DB and upgrade with learner rows). This migration is purely additive, so apply-before-deploy ordering from the README applies (merge, apply migration, deploy Worker).

Seed: `data/conversation/{chunks,scenes}.json` plus a validator (`scripts/validate-conversation.ts`) that checks: terminal reachability, every learner node has a chunk or edges, all edge targets exist, depth <= 12, every chunk has `reading`, `audio_key` present after generation.

### How FSRS schedules what

- Card = chunk. A card is "produce this phrase in this kind of situation, from meaning". One card per chunk per learner; direction is production only in v1 (comprehension is free via Loop 3 NPC lines; add a `direction` column to `conv_chunk_states` only if a recognition card is later wanted).
- Scene is NOT a card. A scene is a container whose mastery is derived from its chunk states (`mastery = share of its chunks with stability >= X days`). Giving scenes their own FSRS card double counts and hides which phrase failed.
- Dialogue node is NOT a card; nodes reference chunks, ratings flow to the chunk the learner used. A chunk appearing in 4 scenes is practiced 4 ways under one card, which is the desired transfer effect.
- Which attempts schedule: Loop 2 drill and Loop 3 Prompted/Open with a chunk-bound edge: yes (`scheduled=1`). Loop 1 echo/shadow: no on first exposure; the first drill creates the state. Loop 4: only "stolen" chunks, created due-now with `initialState(now)`. Guided-with-tap input: no.
- Grade mapping: self_grade 1-4 to again/hard/good/easy via the existing `Grade`. Caps from objective signals computed on the client before sending and re-validated on the Worker: 2+ hints cap at hard; any hint cap at good; replays>=3 cap at good. Latency never auto-lowers a grade in v1 (`gradeFromAnswer` already ignores `elapsedMs`; keep that stance until data exists).
- Due selection: reuse the two-step: due chunks first, then new chunks from the next unlocked scene. A scene unlocks when the previous scene's mastery >= threshold or via placement (D4).
- Worker owns it: new `worker/api/conversation.ts` with `POST /api/conv/attempts` (batch, mirrors `submitReviewBatch`, bounded by `MAX_REVIEW_BATCH_SIZE`), `GET /api/conv/due`, `GET /api/conv/scenes`, `GET /api/conv/scenes/:id`. Follows the roadmap rule: no scheduling in the client. The client uses optimistic labels only.
- Client outbox: `createOutbox` from `src/features/session/outbox.ts` with a new storage prefix, so offline attempts get the native mirror for free. Add the prefix to `outboxPrefixes` in `src/platform/storage.ts`.

---

## 5. Metrics that reflect conversation ability (not XP)

All computed server-side from `conv_attempts` and `conv_chunk_states`; shown in a Stats panel, never converted into XP.

1. Spoken-chunk retention: count of chunks with `stability >= 21 days` and `state = Review`; weekly delta. Query: `conv_chunk_states` filter. Honest about long-term retention of production items.
2. Unaided first-try rate (14 d): `COUNT(attempts WHERE loop IN ('drill','roleplay') AND hints=0 AND replays=0 AND self_grade>=3 AND input='voice') / COUNT(... same loop/input)`, first attempt per chunk per day only to avoid retry inflation.
3. Response latency: median `latency_ms` over voice attempts, per chunk and overall, trend over 4 weeks; "fluent" threshold target < 2.0 s from cue end (tunable). Rule out `thinking > 8 s` bucket and tap input. Uses onset detection (section 6).
4. Transfer rate: success (grade >= 3, no hints) on a chunk in a scene different from the scene where it was first learned. `JOIN` first attempt's `scene_id` per chunk versus later attempts. The closest proxy to "can use it in real life".
5. Assist-level progression: fraction of scene runs completed at Open or Prompted versus Guided, per scene, plus time to first Open completion. Uses `assist`.
6. Register accuracy: on register-switch replays (same intent, polite vs casual NPC), share of turns where the chosen edge/chunk register matches the NPC's. Needs `register` on chunks and the replay variant flag in the attempt (derivable from `scene`/`node variant`).
7. Self-estimate calibration (only when STT is on): mean(self_grade/4) minus mean(`stt_similarity`) per learner; show as "스스로 평가가 후한 편 / 짠 편". Labels the learner's bias; does not grade them. Do not display until >= 30 paired attempts.
8. Speaking volume: spoken minutes per active week = sum `duration_ms` over voice attempts. Explicitly a volume metric, not a skill metric, and not a streak.

Rejected: pronunciation score, speaking streak with XP, "fluency %". They imply measurement we do not have.

---

## 6. Risks and mitigations

| Risk | Detail | Mitigation |
|---|---|---|
| iOS WKWebView mic | `getUserMedia` works in WKWebView on iOS 14.3+ only with `NSMicrophoneUsageDescription` (present). A denied prompt cannot be re-asked; user must go to Settings. Capacitor 8 handles the prompt but no native "open settings" in core | On denied: show per-platform steps; add a tiny `src/platform/permissions.ts` that opens settings via `@capacitor/app` `openUrl("app-settings:")` on iOS if feasible, else instructions text. Verify on a real device, not only simulator (simulator mic differs) |
| MediaRecorder mime differences | Safari/iOS: `audio/mp4` (AAC); Chrome/Android/Firefox: `audio/webm;codecs=opus`. Current `LocalRecorder` calls `new MediaRecorder(stream)` with no mime, so blob type varies and `audio.play()` on the blob works only where decodable (webm/opus playback fails on older iOS) | Pick via `MediaRecorder.isTypeSupported` in order: `audio/mp4`, `audio/webm;codecs=opus`, `audio/webm`; keep `blob.type`; send the real type to the Worker. STT providers: Whisper-family accept mp4/m4a/webm; Google V2 supports auto-decoding for MP4/M4A AAC and WEBM_OPUS (verify per provider before the allowlist is final). Worker allowlists only types the chosen provider decodes |
| Clip duration metadata | Chrome webm blobs lack duration, so scrubbing/length is wrong | Track duration yourself with timestamps; do not trust `audio.duration` |
| Audio session / playback volume | After `getUserMedia`, iOS flips the audio session to play-and-record: output can route to the earpiece or drop volume, and reference audio sounds quieter after the first recording | Use sequential play then record; stop tracks immediately after each clip (existing `stopTracks`); acquire the stream per attempt, not per scene; test Bluetooth headset (iOS may switch to HFP, lowering fidelity); consider a native `@capacitor-community` audio plugin only if real-device tests show unfixable routing |
| Echo / NPC bleed | Speaker playback captured by the mic; STT transcribes the NPC | No overlapped play/record; set `getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})` explicitly (default on mobile but state it); Shadow mode gets no STT |
| Background audio / interruptions | Calls, Siri, app switch suspend the WebView mid-recording; `onAppResume` exists in `src/platform/lifecycle.ts` | On `visibilitychange`/`appStateChange` inactive: stop recorder, release tracks, mark attempt `interrupted` (discard); resume shows `ready`. Never auto-resume recording. Add a lifecycle test like existing `boot.test.ts` |
| Autoplay blocking | Safari blocks `audio.play()` without a gesture; NPC auto-play after a tap chain can fail | Start every scene from a tap (Start button) so the audio context is unlocked; if `play()` rejects show a visible "듣기" button instead of failing silently (existing code already falls back to speechSynthesis; keep) |
| Android hardware variance | `SpeechRecognizer` and webview mic behavior differ per OEM; `RECORD_AUDIO` runtime prompt handled by Capacitor webview, but blocked by some privacy-mode OEMs | Test matrix: one Pixel, one Samsung, one iPhone. Rely on Worker-side STT for uniformity, not native recognizers, in v2 |
| Onset detection false positives | Breath/noise triggers the latency timer | RMS threshold with 150 ms hold and calibrated noise floor from the first 300 ms; store `latency_ms` null when floor-to-peak ratio is low; exclude nulls from metric 3 |
| STT cost abuse | Public hostname, PIN-less profiles | Per-profile daily seconds cap in `conv_stt_usage`, 300 KB body cap, `SPEECH_ENABLED` switch, bearer/profile session required; same-origin check already blocks cross-site writes |
| Worker request size/time | Small clips are fine (<= 300 KB); provider latency must stay inside Worker limits | `AbortController` with 8 s timeout; client shows "피드백 없이 계속" on timeout |
| Privacy/consent | Audio to third-party provider | Per-profile opt-in setting (new column `profile.speech_feedback` default 'off' in a later migration), consent copy before first use, copy states "audio is sent to <provider> and deleted after recognition" only if the provider's retention setting is verified |
| Content quality | TTS accent mistakes, awkward authored dialogue | Native review pass and `source_kind='authored_reviewed'` with reviewer; scene `version` bumps invalidate replays |
| "No AI-generated content" principle | LLM-written dialogue contradicts README | See D1 |
| Tatoeba is not conversational | Existing sentences are isolated; many are odd | Use as a chunk source only after tagging `function_tag`; dialogue lines are authored |

---

## Decisions needed from owner

1. D1 Content policy: may scenes be authored (by you, or LLM-drafted then native-reviewed) given the README rule "real corpus/textbook only, no AI-generated content"? Default chosen: authored + human-reviewed, flagged `authored_reviewed`; LLM only as ephemeral opt-in feedback, never as stored content.
2. D2 Feedback tier for first release: A only (self-compare) or A + STT diff? Default: A only for v1, STT behind a flag after the labeled test set.
3. D3 STT provider: Workers AI whisper (cheapest, no new credential), OpenAI, or Chirp 3 (already scoped)? Default: decide by test set; implement behind a provider interface of exactly one function.
4. D4 Unlock model: linear scene order, placement test, or free choice? Default: free choice within the learner's level, "recommended next" by due chunks.
5. D5 Licensing: confirm Google TTS output redistribution inside store apps, accent dictionary license (CC BY-SA implications), Tatoeba audio attribution. Blocks public distribution (#292), not private TestFlight.
6. D6 Audio retention: never store learner audio or transcripts (default, matches current scope doc), or allow an opt-in archive for scenario replay?
7. D7 Voices: single female voice as today, or two voices (female/male) per scene? Default: two voices, Chirp 3 HD.
8. D8 Native recordings: do you or a Japanese friend record the first ~200 chunks, or TTS only for v1? Default: TTS only, record later.
9. D9 Scope of "daily conversation": initial scene list (suggest 12: greetings/intro, cafe order, convenience store, train station, asking directions, restaurant, shopping/size, hotel check-in, doctor/pharmacy, making plans with a friend, apologizing/declining, phone/delivery). Needs your picks and target register (polite default, casual for friends).
10. D10 Surface: new Home entry beside the kanji path, with its own `conv` area outside `enabled_tracks`? Default: yes, a separate surface that does not add a 4th track.

---

## Suggested Codex implementation slices

Each slice is small and independent unless stated. Each leaves `npm run typecheck && npm run lint && npm test` green; Worker slices include tests in the style of `worker/api/*.test.ts`.

1. Recorder hardening (no schema). Mime selection by `isTypeSupported`, expose `blob.type` and measured duration, interrupt handling on app pause, silence detection. Files: `src/features/study/speech.ts`, `src/platform/lifecycle.ts` consumer. Acceptance: unit tests for mime fallback order (mp4, webm opus, webm), interrupted state discards the clip and stops tracks, silent clip yields `no_audio` state; existing speaking tests still pass; no network request contains audio.
2. `shared/speechDiff.ts` pure diff. Normalize (NFKC, punctuation, kata to hira via `shared/kana.ts`), per-chunk `acceptedForms`, Levenshtein ops. Acceptance: table-driven tests for `今日`/`きょう`, numerals, long vowels, empty transcript, and a Whisper-style hallucination string scoring < 0.3 against a target; zero DOM/Worker imports (shared/ rule).
3. Migration `0025_conversation_core.sql` + types in `shared/types.ts`. Tables per section 4 (content, states, attempts, usage). Acceptance: migration test on fresh DB and upgrade DB (pattern of `worker/db/migrations.test.ts`); `wrangler d1 migrations apply hanja --local` passes; FK cascade on profile delete verified.
4. Conversation seed format and validator. `data/conversation/*.json` schema, `scripts/seed.ts` extension (idempotent), `scripts/validate-conversation.ts`. Acceptance: 2 sample scenes seed twice with identical row counts; validator rejects a dead-end graph, a missing edge target, depth > 12, a chunk without `reading`; tests for each rejection.
5. Audio key scheme and generator. Add `c/{hash16}` branch to `worker/audio.ts` `audioObjectKey` with immutable cache headers, `buildConversationAudioEntries` in `scripts/generate-audio.ts`, `npm run audio:generate:conv`. Acceptance: `worker/audio.test.ts` covers valid/invalid keys and cache-control; generator unit test shows only missing keys requested (HEAD skip), same text/voice gives the same key.
6. Conversation read API. `worker/api/conversation.ts`: `GET /api/conv/scenes`, `GET /api/conv/scenes/:id` (nodes, edges, chunks, audioUrls), `GET /api/conv/due`. Registered in `worker/api/router.ts`. Acceptance: router tests for auth required, 404 on unknown scene, due list ordered by `due`, response matches shared types; additive (no compat bump).
7. Attempt ingestion + FSRS. `POST /api/conv/attempts` batch, idempotent on `(profile_id, client_attempt_id)`, calls `schedule` from `shared/fsrs.ts`, creates state via `initialState`, applies grade caps for hints/replays, late-event rule. Acceptance: replaying the same batch changes nothing; hints=2 with self_grade 4 stores hard; Loop `echo` never schedules; Loop `free` with stolen chunk creates a due-now state; batch > `MAX_REVIEW_BATCH_SIZE` rejected with the standard error shape.
8. Drill screen (Loop 2) behind a route. `src/screens/ConversationDrillScreen.tsx` + feature folder, reuses `LocalRecorder`, `createOutbox` with a new storage prefix (add to `src/platform/storage.ts`). Acceptance: Playwright keyboard-only flow (cue, R to record with a fake media stream, 1-4 rate, Enter next); offline test (route blocked) queues attempts then flushes; mic-denied path shows tap fallback with `input='tap'`.
9. Role-play screen (Loop 3, Guided and Prompted only). Scene runner state machine as a pure reducer (`src/features/conversation/sceneMachine.ts`) with tests; UI on top. Acceptance: reducer tests for branching, terminal, default_next, depth cap; Playwright run of the sample scene end to end with audio stubbed; NPC audio 404 falls back to speechSynthesis and sets `degraded`.
10. Echo/shadow and free-speech screens (Loops 1 and 4) incl. "steal a chunk" action. Acceptance: free loop produces no FSRS grade; tagging 2 chunks creates 2 due-now states; shadow mode never starts recorder.
11. Metrics endpoint and Stats panel. `GET /api/conv/stats` returning the 8 metrics (section 5) with `null` when insufficient data. Acceptance: SQL tests with fixture attempts verify each formula, including first-attempt-per-day dedupe and tap exclusion.
12. Transcribe endpoint (flagged). `POST /api/speech/transcribe` with mime/size/duration allowlists, `conv_stt_usage` cap, provider function, `SPEECH_ENABLED` switch, 8 s timeout. Acceptance: tests with a stub provider for 413/415/429/503/timeout; request body is not logged or stored (assert no write beyond usage row); returns 404 or 503 when disabled.
13. Offline scene pack (native). `src/platform/audioCache.ts` using Capacitor Filesystem on native and Cache API on web, "download scene" button. Acceptance: adapter tests in the style of `src/platform/adapters.test.ts`; a cached scene plays with the network blocked.
14. Native permissions text. Add `NSSpeechRecognitionUsageDescription` only if on-device STT is chosen; settings-link helper for denied mic. Acceptance: `xcodebuild` compile check from README passes; `npm run build:mobile` succeeds.
