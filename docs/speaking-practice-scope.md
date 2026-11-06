# Japanese and Chinese speaking practice scope

## First deliverable: record and compare

- Add a separate `speaking` session for Japanese and Chinese sentence cards.
- Request microphone permission only after the learner presses Record.
- Record one clip of at most 15 seconds with `getUserMedia({ audio: true })`
  and `MediaRecorder`, then allow replay beside the existing reference audio.
- Keep the clip in browser memory; stop all media tracks on finish, retry,
  navigation, and error. Never upload or persist it in this phase.
- Show permission-denied and unsupported-browser states. Practice remains
  optional and does not affect FSRS, placement, XP, streaks, or unit tests.

Acceptance: both `jp` and `cn` sentence cards can record, replay, replace, and
discard a clip using keyboard and touch controls; no network request contains
recorded audio.

## Shipped: Talk shadowing with on-device feedback

Talk "say" cards (chunks and slot drills) get a "따라 말하기" action after the
answer is revealed. It opens a shadowing panel:

1. Play the line (cached chunk audio; speech synthesis `ja-JP` when the clip is
   missing or fails, and always for composed slot-drill lines).
2. Record one clip with `MediaRecorder` (same `LocalRecorder` as above) and
   replay it beside the reference.
3. Where the browser has `SpeechRecognition`/`webkitSpeechRecognition`, the
   same take is recognized as `ja-JP` by the browser. The transcript and the
   target are normalized (NFKC, katakana to hiragana, punctuation and spaces
   removed) and compared character by character against both the written line
   and its kana reading, keeping the closer match. The panel shows matched,
   missing and extra characters, a percentage, and plain Korean hints (for
   example a dropped particle). Logic lives in `shared/speechScore.ts`.
4. The learner picks 다시 / 비슷해요 / 좋아요 (again / hard / good) and confirms.
   A score of 90% or more preselects good, 60% or more hard, below that again.
   The learner can change it; nothing is submitted until they confirm.

Without `SpeechRecognition` (Firefox, some WebViews), or when its permission or
service fails, the panel says automatic comparison is unavailable and works as
record, replay and self-grade only. Without recording support it is self-grade
only.

What is stored: the rating only, as a normal FSRS "say" attempt with
`loop: "shadow"` and `input: "voice"`. The audio clip and the transcript stay
in component memory and are dropped on close, re-record, or navigation.
Browser recognition may be performed by the browser vendor's speech service;
the app itself sends nothing to its Worker. The feedback is a text comparison,
not a pronunciation score, and is labeled as a reference in the UI.

Not shipped: the server-side Chirp 3 path below. It stays an option only if
browser recognition proves too uneven.

## Follow-up: transcript feedback experiment (not built)

Use a Worker-authenticated endpoint to send one bounded clip to Google Cloud
Speech-to-Text V2 `Recognize` with Chirp 3. Google documents GA support for
Japanese `ja-JP` and Simplified Chinese `cmn-Hans-CN`. Credentials stay in
Worker secrets; the client never calls Google directly. Delete the request
body after recognition, store neither audio nor transcript, and enforce MIME,
size, duration, rate, and origin limits.

The experiment returns a transcript and highlights text differences only. It
must not claim pronunciation quality or change learning state until a labeled
evaluation shows the feedback is useful across accents and devices. Before
shipping, approve provider cost/region, consent and retention copy, abuse
limits, and a test set for both languages.

References: [MDN MediaStream Recording](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API), [Google Chirp 3 languages](https://cloud.google.com/speech-to-text/v2/docs/chirp_3-model), and [Speech-to-Text V2 recognizers](https://cloud.google.com/speech-to-text/v2/docs/reference/rest/v2/projects.locations.recognizers).
