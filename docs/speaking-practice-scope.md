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

## Follow-up: transcript feedback experiment

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
