import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationGrade } from "../../../shared/api";
import { scoreSpeech, speechHints, suggestGrade, type SpeechScore } from "../../../shared/speechScore";
import { LocalRecorder, localRecordingSupported, speechLanguages, type LocalRecordingState } from "../study/speech";
import { startRecognition, type ActiveRecognition } from "../study/recognition";

type ShadowGrade = Extract<ConversationGrade, "again" | "hard" | "good">;
type Props = {
  // Accepted spellings of the line (kanji form and reading); the transcript is scored against the closer one.
  targets: readonly string[];
  onPlayReference: () => void;
  onRate: (grade: ShadowGrade) => void;
  onClose: () => void;
};
type Heard = { status: "idle" | "listening" | "unavailable" } | { status: "scored"; result: SpeechScore };

const grades: ReadonlyArray<readonly [ShadowGrade, string]> = [["again", "다시"], ["hard", "비슷해요"], ["good", "좋아요"]];

// Shadowing: hear the line, record it on this device, compare by ear and by on-device recognition, grade yourself.
// Neither the clip nor the transcript leaves this component's memory; only the confirmed grade is reported.
export function ShadowPanel({ targets, onPlayReference, onRate, onClose }: Props) {
  const [recording, setRecording] = useState<LocalRecordingState>(() => localRecordingSupported() ? { status: "idle" } : { status: "unsupported" });
  const [heard, setHeard] = useState<Heard>({ status: "idle" });
  const [picked, setPicked] = useState<ShadowGrade | null>(null);
  const recorderRef = useRef<LocalRecorder | null>(null);
  const recognitionRef = useRef<ActiveRecognition | null>(null);
  const targetsRef = useRef(targets);
  useEffect(() => { targetsRef.current = targets; }, [targets]);

  // Recognition runs alongside the recording and settles when the recording does.
  const onRecording = useCallback((next: LocalRecordingState) => {
    setRecording(next);
    if (next.status === "recording") {
      recognitionRef.current?.abort();
      setPicked(null);
      const active = startRecognition(speechLanguages.jp, (result) => {
        recognitionRef.current = null;
        if (result.status !== "ok") { setHeard({ status: "unavailable" }); return; }
        const scored = scoreSpeech(result.transcript, targetsRef.current);
        setHeard({ status: "scored", result: scored });
        setPicked(suggestGrade(scored.score));
      });
      recognitionRef.current = active;
      setHeard(active ? { status: "listening" } : { status: "unavailable" });
    } else if (next.status === "ready") {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setHeard({ status: "idle" });
    }
  }, []);

  useEffect(() => {
    const recorder = new LocalRecorder(onRecording);
    recorderRef.current = recorder;
    return () => { recorder.dispose(); recognitionRef.current?.abort(); if (recorderRef.current === recorder) recorderRef.current = null; };
  }, [onRecording]);

  const toggle = useCallback(() => {
    if (recording.status === "recording") { recorderRef.current?.stop(); return; }
    if (recording.status === "requesting" || recording.status === "unsupported") return;
    void recorderRef.current?.record();
  }, [recording.status]);

  const ready = recording.status === "ready";
  const unsupported = recording.status === "unsupported";
  return <div className="talk-screen__shadow" data-shadow-status={recording.status}>
    <small>따라 말하기 · 기기 안에서만 녹음·인식, 저장하지 않음</small>
    <div className="talk-screen__shadow-actions">
      <button onClick={onPlayReference} type="button">원어민 듣기</button>
      <button disabled={recording.status === "requesting" || unsupported} onClick={toggle} type="button">{recording.status === "recording" ? "녹음 중지" : ready ? "다시 녹음" : "녹음 시작"}</button>
    </div>
    {recording.status === "requesting" && <p>마이크 권한을 확인하는 중…</p>}
    {recording.status === "recording" && <p>녹음 중… 최대 15초</p>}
    {recording.status === "denied" && <p role="alert">마이크를 쓸 수 없습니다. 듣고 따라 한 뒤 직접 평가하세요.</p>}
    {recording.status === "no_audio" && <p role="alert">소리가 감지되지 않았습니다. 다시 녹음하거나 직접 평가하세요.</p>}
    {(recording.status === "error" || recording.status === "interrupted") && <p role="alert">녹음하지 못했습니다. 다시 시도하거나 직접 평가하세요.</p>}
    {unsupported && <p role="alert">이 브라우저는 녹음을 지원하지 않습니다. 듣고 따라 한 뒤 직접 평가하세요.</p>}
    {ready && <label className="talk-screen__self-audio">내 목소리 <audio controls src={recording.url} /></label>}
    {ready && heard.status === "unavailable" && <p>이 기기에서는 자동 비교를 쓸 수 없습니다. 두 소리를 비교해 직접 평가하세요.</p>}
    {ready && heard.status === "listening" && <p>인식하는 중…</p>}
    {heard.status === "scored" && <div aria-live="polite" className="talk-screen__heard">
      <p>인식된 소리 · 비교 {Math.round(heard.result.score * 100)}%</p>
      {heard.result.ops.length > 0 && <p className="talk-screen__diff" lang="ja">{heard.result.ops.map((op, index) => <span className={`talk-screen__diff-${op.type}`} key={index}>{op.text}</span>)}</p>}
      <ul>{speechHints(heard.result).map((hint) => <li key={hint}>{hint}</li>)}</ul>
      <small>음성 인식은 참고용입니다. 발음 품질을 채점하지 않습니다.</small>
    </div>}
    <div role="group" aria-label="따라 말하기 평가" className="talk-screen__ratings">
      {grades.map(([grade, label]) => <button aria-pressed={picked === grade} className={picked === grade ? "is-preselected" : undefined} key={grade} onClick={() => setPicked(grade)} type="button">{label}</button>)}
    </div>
    <div className="talk-screen__shadow-actions">
      <button onClick={onClose} type="button">닫기</button>
      <button disabled={picked === null} onClick={() => picked && onRate(picked)} type="button">이 평가로 다음</button>
    </div>
  </div>;
}
