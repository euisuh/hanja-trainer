import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { enqueuePendingConversationAttempt } from "../features/conversation/attemptOutbox";
import { useActiveProfile } from "../features/profile/ProfileContext";
import { SourceAttribution } from "../features/source/SourceAttribution";
import { LocalRecorder, localRecordingSupported, type LocalRecordingState } from "../features/study/speech";
import { apiClient, type ConversationUnitResponse } from "../lib/apiClient";
import { onAppInactive } from "../platform/lifecycle";
import "../features/conversation/talk.css";

type TalkStage = "cue" | "reveal" | "rate";

const slowOnsetMs = 3_000;

function gradeFor(onsetMs: number | null): "hard" | "good" {
  return onsetMs !== null && onsetMs > slowOnsetMs ? "hard" : "good";
}

function attemptId(): string {
  return crypto.randomUUID();
}

export function TalkScreen() {
  const { unitId: rawUnitId } = useParams<{ unitId: string }>();
  const unitId = Number(rawUnitId);
  const { id: profileId } = useActiveProfile();
  const navigate = useNavigate();
  const [content, setContent] = useState<ConversationUnitResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<TalkStage>("cue");
  const [recording, setRecording] = useState<LocalRecordingState>(() => localRecordingSupported() ? { status: "idle" } : { status: "unsupported" });
  const [error, setError] = useState("");
  const [replays, setReplays] = useState(0);
  const [selectedGrade, setSelectedGrade] = useState<"again" | "hard" | "good">("good");
  const recorderRef = useRef<LocalRecorder | null>(null);
  const card = content?.chunks[index];
  const preselectedGrade = recording.status === "ready" ? gradeFor(recording.onsetMs) : "good";

  const onRecordingChange = useCallback((next: LocalRecordingState) => {
    setRecording(next);
    if (next.status === "ready") {
      setSelectedGrade(gradeFor(next.onsetMs));
      setStage("rate");
    }
  }, []);

  useEffect(() => {
    const recorder = new LocalRecorder(onRecordingChange);
    recorderRef.current = recorder;
    return () => { recorder.dispose(); if (recorderRef.current === recorder) recorderRef.current = null; };
  }, [onRecordingChange]);

  useEffect(() => onAppInactive(() => recorderRef.current?.interrupt()), []);

  useEffect(() => {
    if (!Number.isSafeInteger(unitId) || unitId < 1) return;
    const controller = new AbortController();
    apiClient.conversationUnit(unitId, controller.signal).then((response) => {
      if (response.chunks.length === 0) { setError("Talk 문장이 없습니다."); return; }
      setContent(response);
      setError("");
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection is an untyped I/O boundary.
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Talk 문장을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [unitId]);

  const reveal = useCallback(() => {
    recorderRef.current?.discard();
    setStage("reveal");
  }, []);

  const record = useCallback(() => {
    if (recording.status === "recording") { recorderRef.current?.stop(); return; }
    if (recording.status === "requesting" || recording.status === "unsupported") return;
    void recorderRef.current?.record();
  }, [recording.status]);

  const rate = useCallback((grade: "again" | "hard" | "good") => {
    if (!card) return;
    const latencyMs = recording.status === "ready" ? recording.onsetMs : null;
    enqueuePendingConversationAttempt(profileId, {
      clientAttemptId: attemptId(), chunkId: card.id, role: card.role, grade,
      answeredAt: Date.now(), latencyMs, replays,
    });
    recorderRef.current?.discard();
    if (content && index + 1 < content.chunks.length) {
      setIndex((value) => value + 1);
      setStage("cue");
      setSelectedGrade("good");
      setReplays(0);
      return;
    }
    navigate("/home");
  }, [card, content, index, navigate, profileId, recording, replays]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("button, input, textarea, select, audio") || target.isContentEditable)) return;
      if (event.key === "Escape") { event.preventDefault(); navigate("/home"); return; }
      if (event.key === "r" || event.key === "R") { event.preventDefault(); record(); return; }
      if (event.key === " ") { event.preventDefault(); reveal(); return; }
      if (stage === "rate" && event.key === "1") { event.preventDefault(); setSelectedGrade("again"); return; }
      if (stage === "rate" && event.key === "2") { event.preventDefault(); setSelectedGrade("hard"); return; }
      if (stage === "rate" && event.key === "3") { event.preventDefault(); setSelectedGrade("good"); return; }
      if (event.key === "Enter" && stage === "rate") { event.preventDefault(); rate(selectedGrade); return; }
      if (event.key === "Enter" && stage === "reveal") { event.preventDefault(); setStage("rate"); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, rate, record, reveal, selectedGrade, stage]);

  if (!Number.isSafeInteger(unitId) || unitId < 1 || error) return <section className="talk-root talk-screen"><p role="alert">{error || "Talk 단위를 찾을 수 없습니다."}</p><button onClick={() => navigate("/home")} type="button">돌아가기</button></section>;
  if (!content || !card) return <section className="talk-root talk-screen"><p>Talk 문장을 불러오는 중…</p></section>;

  const canRate = stage === "rate";
  return <section className="talk-root talk-screen" data-talk-stage={stage}>
    <header className="talk-screen__meta"><span>p.{content.unit.ord} · Talk</span><span>{index + 1} / {content.chunks.length}</span></header>
    <p className="talk-screen__goal">{content.unit.goalKo}</p>
    <div className="talk-screen__page">
      <p className="talk-screen__cue">{card.koCue}</p>
      {stage !== "cue" && <div className="talk-screen__answer">
        <strong lang="ja">{card.ja}</strong>
        <span lang="ja">{card.kana}</span>
        <button className="talk-screen__audio" onClick={() => { setReplays((value) => value + 1); new Audio(card.audioUrl).play().catch(() => undefined); }} type="button">듣기 <kbd>Space</kbd></button>
        <small className="talk-screen__source">출처 · <SourceAttribution source={card.sourceRef} /></small>
      </div>}
      <div className="talk-screen__attempt">
        <small>내 시도 · 기기 안에서만 측정</small>
        {recording.status === "recording" && <p>녹음 중… <button onClick={record} type="button">중지 <kbd>R</kbd></button></p>}
        {recording.status === "denied" && <p role="alert">마이크를 쓸 수 없습니다. 답을 떠올린 뒤 공개하세요.</p>}
        {recording.status === "no_audio" && <p role="alert">소리가 감지되지 않았습니다. 직접 평가할 수 있습니다.</p>}
        {recording.status === "ready" && <p>첫 소리 {recording.onsetMs === null ? "측정 안 됨" : `${(recording.onsetMs / 1000).toFixed(1)}초`}</p>}
      </div>
      {canRate && <div aria-label="자기 평가" className="talk-screen__ratings">
        <button aria-pressed={selectedGrade === "again"} className={selectedGrade === "again" ? "is-preselected" : undefined} onClick={() => setSelectedGrade("again")} type="button">못함 <kbd>1</kbd></button>
        <button aria-pressed={selectedGrade === "hard"} className={selectedGrade === "hard" ? "is-preselected" : undefined} onClick={() => setSelectedGrade("hard")} type="button">막힘 <kbd>2</kbd></button>
        <button aria-pressed={selectedGrade === "good"} className={selectedGrade === "good" ? "is-preselected" : undefined} onClick={() => setSelectedGrade("good")} type="button">바로 <kbd>3</kbd></button>
      </div>}
    </div>
    <footer className="talk-screen__bar">
      {stage === "cue" && <button onClick={reveal} type="button">정답 공개 <kbd>Space</kbd></button>}
      {stage !== "rate" && <button className="talk-screen__record" disabled={recording.status === "requesting" || recording.status === "unsupported"} onClick={record} type="button">{recording.status === "recording" ? "녹음 중지" : "말하기"} <kbd>R</kbd></button>}
      {stage === "reveal" && <button onClick={() => { setSelectedGrade(preselectedGrade); setStage("rate"); }} type="button">평가하기 <kbd>Enter</kbd></button>}
      {stage === "rate" && <button onClick={() => rate(selectedGrade)} type="button">다음 쪽 <kbd>Enter</kbd></button>}
    </footer>
  </section>;
}
