import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { enqueuePendingConversationAttempt } from "../features/conversation/attemptOutbox";
import { SceneRunner } from "../features/conversation/SceneRunner";
import { SlotDrillCard } from "../features/conversation/SlotDrillCard";
import { ListenCard } from "../features/conversation/ListenCard";
import { ShadowPanel } from "../features/conversation/ShadowPanel";
import { useActiveProfile } from "../features/profile/ProfileContext";
import { SourceAttribution } from "../features/source/SourceAttribution";
import { LocalRecorder, localRecordingSupported, matchingVoice, speechLanguages, useSpeechVoices, type LocalRecordingState } from "../features/study/speech";
import { apiClient } from "../lib/apiClient";
import { apiUrl } from "../platform/apiUrl";
import { onAppInactive } from "../platform/lifecycle";
import "../features/conversation/talk.css";
import type { ConversationGrade, ConversationInput, ConversationLoop, ConversationSessionItem, ConversationSessionResponse } from "../../shared/api";

type TalkStage = "cue" | "reveal" | "rate";
type SessionEntry = { item: ConversationSessionItem; correction: boolean };

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
  const [content, setContent] = useState<ConversationSessionResponse | null>(null);
  // ponytail: character data is ~488 KB, so load the hanja bridge on demand instead of bloating the app chunk.
  const [bridge, setBridge] = useState<typeof import("../../shared/hanjaBridge").hanjaBridge | null>(null);
  useEffect(() => { void import("../../shared/hanjaBridge").then((module) => setBridge(() => module.hanjaBridge)); }, []);
  const [items, setItems] = useState<SessionEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<TalkStage>("cue");
  const [recording, setRecording] = useState<LocalRecordingState>(() => localRecordingSupported() ? { status: "idle" } : { status: "unsupported" });
  const [error, setError] = useState("");
  const [hints, setHints] = useState(0);
  const [replays, setReplays] = useState(0);
  const [selectedGrade, setSelectedGrade] = useState<"again" | "hard" | "good">("good");
  const [shadowing, setShadowing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [spoken, setSpoken] = useState(0);
  const [onsets, setOnsets] = useState<number[]>([]);
  const recorderRef = useRef<LocalRecorder | null>(null);
  const cueShownAtRef = useRef(0);
  const selfAudioRef = useRef<HTMLAudioElement | null>(null);
  const entry = items[index];
  const card = entry?.item.kind === "chunk" ? entry.item.chunk : undefined;
  const voices = useSpeechVoices();
  const voice = matchingVoice(voices, "jp");
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

  useEffect(() => onAppInactive(() => recorderRef.current?.discard()), []);

  useEffect(() => { cueShownAtRef.current = performance.now(); }, [card?.id]);

  useEffect(() => {
    if (!Number.isSafeInteger(unitId) || unitId < 1) return;
    const controller = new AbortController();
    apiClient.conversationSession(unitId, controller.signal).then((response) => {
      if (response.items.length === 0) { setError("Talk 문장이 없습니다."); return; }
      setContent(response);
      setItems(response.items.map((item) => ({ item, correction: false })));
      setIndex(0);
      setFinished(false);
      setError("");
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection is an untyped I/O boundary.
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Talk 문장을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [unitId]);

  const reveal = useCallback(() => {
    recorderRef.current?.reset();
    setHints(1);
    setStage("reveal");
  }, []);

  const record = useCallback(() => {
    if (recording.status === "recording") { recorderRef.current?.stop(); return; }
    if (recording.status === "requesting" || recording.status === "unsupported") return;
    void recorderRef.current?.record(cueShownAtRef.current);
  }, [recording.status]);

  const rate = useCallback((grade: ConversationGrade, input: ConversationInput, replayCount = replays, loop: ConversationLoop = "drill") => {
    if (!card) return;
    const latencyMs = recording.status === "ready" ? recording.onsetMs : null;
    enqueuePendingConversationAttempt(profileId, {
      clientAttemptId: attemptId(), chunkId: card.id, role: card.role, grade,
      answeredAt: Date.now(), latencyMs, hints, replays: replayCount, loop,
      input: recording.status === "ready" ? "voice" : input,
    });
    recorderRef.current?.reset();
    setShadowing(false);
    if (card.role === "say" && !entry?.correction) {
      setSpoken((value) => value + 1);
      if (latencyMs !== null) setOnsets((value) => [...value, latencyMs]);
    }
    if (grade === "again" && !entry?.correction) {
      setItems((value) => {
        const insertAt = Math.min(value.length, index + 4);
        return [...value.slice(0, insertAt), { item: entry.item, correction: true }, ...value.slice(insertAt)];
      });
    }
    if (index + 1 < items.length || (grade === "again" && !entry?.correction)) {
      setIndex((value) => value + 1);
      setStage("cue");
      setSelectedGrade("good");
      setHints(0);
      setReplays(0);
      return;
    }
    setFinished(true);
  }, [card, entry, hints, index, items.length, profileId, recording, replays]);

  const playReference = useCallback(() => {
    if (!card) return;
    setReplays((value) => value + 1);
    const fallback = () => {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
      const utterance = new SpeechSynthesisUtterance(card.ja);
      utterance.lang = speechLanguages.jp;
      if (voice) utterance.voice = voice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Browser audio constructor capability probe.
    if (typeof Audio !== "function" || !card.audioUrl) { fallback(); return; }
    const audio = new Audio(apiUrl(card.audioUrl));
    let failed = false;
    const fallbackOnce = () => { if (!failed) { failed = true; fallback(); } };
    audio.addEventListener("error", fallbackOnce, { once: true });
    void audio.play().catch(fallbackOnce);
  }, [card, voice]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("button, input, textarea, select, audio") || target.isContentEditable)) return;
      if (event.key === "Escape") { event.preventDefault(); navigate("/home"); return; }
      if (shadowing) return;
      if (stage === "reveal" && (event.key === "r" || event.key === "R")) { event.preventDefault(); setShadowing(true); return; }
      if (event.key === "r" || event.key === "R") { event.preventDefault(); record(); return; }
      if (event.shiftKey && event.key === " " && stage === "rate") { event.preventDefault(); void selfAudioRef.current?.play().catch(() => undefined); return; }
      if (event.key === " ") { event.preventDefault(); reveal(); return; }
      if (stage === "rate" && event.key === "1") { event.preventDefault(); setSelectedGrade("again"); return; }
      if (stage === "rate" && event.key === "2") { event.preventDefault(); setSelectedGrade("hard"); return; }
      if (stage === "rate" && event.key === "3") { event.preventDefault(); setSelectedGrade("good"); return; }
      if (event.key === "Enter" && stage === "rate") { event.preventDefault(); rate(selectedGrade, "keyboard"); return; }
      if (event.key === "Enter" && stage === "reveal") { event.preventDefault(); setStage("rate"); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, rate, record, reveal, selectedGrade, shadowing, stage]);

  if (!Number.isSafeInteger(unitId) || unitId < 1 || error) return <section className="talk-root talk-screen"><p role="alert">{error || "Talk 단위를 찾을 수 없습니다."}</p><button onClick={() => navigate("/home")} type="button">돌아가기</button></section>;
  if (!content || !entry) return <section className="talk-root talk-screen"><p>Talk 문장을 불러오는 중…</p></section>;
  if (finished) {
    const sorted = [...onsets].sort((left, right) => left - right);
    const median = sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
    return <section className="talk-root talk-screen"><div className="talk-screen__page"><h1>오늘 Talk 완료</h1><p>말한 문장 {spoken}개</p><p>중간 첫소리 {median === null ? "측정 안 됨" : `${(median / 1000).toFixed(1)}초`}</p><p>다음 복습은 저장 뒤 일정에 맞춰 표시됩니다.</p><button onClick={() => navigate("/talk")} type="button">Talk로 돌아가기</button></div></section>;
  }
  if (entry.item.kind === "scene") return <SceneRunner chunks={content.chunks} onExit={() => { if (index + 1 < items.length) { setIndex((value) => value + 1); setStage("cue"); } else { setFinished(true); } }} profileId={profileId} scene={entry.item.scene} />;
  if (entry.item.kind === "drill") {
    const template = entry.item.template;
    const rateDrill = (grade: ConversationGrade) => {
      enqueuePendingConversationAttempt(profileId, { clientAttemptId: attemptId(), chunkId: template.patternChunkId, templateId: template.id, role: "say", grade, answeredAt: Date.now(), loop: "drill", input: "tap" });
      setSpoken((value) => value + 1);
      if (index + 1 < items.length) { setIndex((value) => value + 1); setStage("cue"); } else { setFinished(true); }
    };
    return <SlotDrillCard key={`${template.id}:${index}`} onRate={rateDrill} template={template} />;
  }
  if (!card) return <section className="talk-root talk-screen"><p>Talk 문장을 불러오는 중…</p></section>;
  if (card.role === "hear") return <section className="talk-root talk-screen" data-talk-stage="listen"><header className="talk-screen__meta"><span>p.{content.unit.ord} · Talk</span><span>{index + 1} / {items.length}</span></header><p className="talk-screen__goal">{content.unit.goalKo}</p><ListenCard card={card} choices={content.chunks.filter((chunk) => chunk.role === "hear")} onNext={(grade, cardReplays, input) => rate(grade, input, cardReplays)} /></section>;

  const canRate = stage === "rate";
  return <section className="talk-root talk-screen" data-talk-stage={stage}>
    <header className="talk-screen__meta"><span>p.{content.unit.ord} · Talk</span><span>{index + 1} / {items.length}</span></header>
    <p className="talk-screen__goal">{content.unit.goalKo}</p>
    <div className="talk-screen__page">
      <p className="talk-screen__cue">{card.koCue}</p>
      {stage !== "cue" && <div className="talk-screen__answer">
        <strong lang="ja">{(bridge ? bridge(card.ja) : [{ text: card.ja, reading: null }]).map((run, index) => run.reading === null ? run.text : <span className="talk-screen__hanja-bridge" key={index}><mark>{run.text}</mark><small>{run.text}({run.reading})</small></span>)}</strong>
        <span lang="ja">{card.kana}</span>
        <button className="talk-screen__audio" onClick={playReference} type="button">듣기 <kbd>Space</kbd></button>
        {recording.status === "ready" && <label className="talk-screen__self-audio">내 목소리 <audio controls ref={selfAudioRef} src={recording.url} /> <kbd>Shift+Space</kbd></label>}
        {card.noteKo && <small className="talk-screen__source talk-screen__note">{card.noteKo}</small>}
        <small className="talk-screen__source">출처 · <SourceAttribution source={card.sourceRef} sourceAuthor={card.sourceAuthor} /></small>
      </div>}
      {shadowing && <ShadowPanel targets={[card.ja, card.kana]} onClose={() => setShadowing(false)} onPlayReference={playReference} onRate={(grade) => rate(grade, "voice", replays, "shadow")} />}
      {!shadowing && <div className="talk-screen__attempt">
        <small>내 시도 · 기기 안에서만 측정</small>
        {recording.status === "recording" && <p>녹음 중… <button onClick={record} type="button">중지 <kbd>R</kbd></button></p>}
        {recording.status === "denied" && <p role="alert">마이크를 쓸 수 없습니다. 답을 떠올린 뒤 공개하세요.</p>}
        {recording.status === "no_audio" && <p role="alert">소리가 감지되지 않았습니다. 직접 평가할 수 있습니다.</p>}
        {recording.status === "ready" && <p>첫 소리 {recording.onsetMs === null ? "측정 안 됨" : `${(recording.onsetMs / 1000).toFixed(1)}초`}</p>}
      </div>}
      {canRate && !shadowing && <div role="group" aria-label="자기 평가" className="talk-screen__ratings">
        <button aria-pressed={selectedGrade === "again"} className={selectedGrade === "again" ? "is-preselected" : undefined} onClick={() => setSelectedGrade("again")} type="button">못함 <kbd>1</kbd></button>
        <button aria-pressed={selectedGrade === "hard"} className={selectedGrade === "hard" ? "is-preselected" : undefined} onClick={() => setSelectedGrade("hard")} type="button">막힘 <kbd>2</kbd></button>
        <button aria-pressed={selectedGrade === "good"} className={selectedGrade === "good" ? "is-preselected" : undefined} onClick={() => setSelectedGrade("good")} type="button">바로 <kbd>3</kbd></button>
      </div>}
    </div>
    <footer className="talk-screen__bar">
      {stage === "cue" && <button onClick={reveal} type="button">정답 공개 <kbd>Space</kbd></button>}
      {stage === "cue" && <button className="talk-screen__record" disabled={recording.status === "requesting" || recording.status === "unsupported"} onClick={record} type="button">{recording.status === "recording" ? "녹음 중지" : "말하기"} <kbd>R</kbd></button>}
      {stage === "reveal" && !shadowing && <button className="talk-screen__record" onClick={() => setShadowing(true)} type="button">따라 말하기 <kbd>R</kbd></button>}
      {stage === "reveal" && !shadowing && <button onClick={() => { setSelectedGrade(preselectedGrade); setStage("rate"); }} type="button">평가하기 <kbd>Enter</kbd></button>}
      {stage === "rate" && <button onClick={() => rate(selectedGrade, "tap")} type="button">다음 쪽 <kbd>Enter</kbd></button>}
    </footer>
  </section>;
}
