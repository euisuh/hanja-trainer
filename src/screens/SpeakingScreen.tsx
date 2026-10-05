import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SourceAttribution } from "../features/source/SourceAttribution";
import { LocalRecorder, localRecordingSupported, matchingVoice, sentenceAudioUrl, speechLanguages, useSpeechVoices, type LocalRecordingState } from "../features/study/speech";
import { trackThemes } from "../features/tracks/trackTheme";
import { apiClient } from "../lib/apiClient";
import { onAppInactive } from "../platform/lifecycle";
import type { ApiSentence, UnitStudyResponse } from "../../shared/api";
import type { Track } from "../../shared/types";
import "../features/study/study.css";

type SpeakingTrack = Exclude<Track, "kr">;
type SpeakingCard = { sentence: ApiSentence; track: SpeakingTrack };

const PASS_TARGET = 3;

function speakingCards(detail: UnitStudyResponse | null): SpeakingCard[] {
  if (!detail || detail.unit.track === "kr") return [];
  const track = detail.unit.track;
  return detail.characters.flatMap((character) => {
    const entry = character.tracks.find((candidate) => candidate.track === track);
    if (!entry) return [];
    return entry.sentences.flatMap((sentence) => sentence.reading ? [{ sentence, track }] : []);
  });
}

export function SpeakingScreen() {
  const { unitId: rawUnitId } = useParams<{ unitId: string }>();
  const unitId = Number(rawUnitId);
  const navigate = useNavigate();
  const [detail, setDetail] = useState<UnitStudyResponse | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [index, setIndex] = useState(0);
  const [pass, setPass] = useState(1);
  const [recording, setRecording] = useState<LocalRecordingState>(() => localRecordingSupported() ? { status: "idle" } : { status: "unsupported" });
  const recorderRef = useRef<LocalRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voices = useSpeechVoices();
  const cards = useMemo(() => speakingCards(detail), [detail]);
  const card = cards[index];
  const voice = card ? matchingVoice(voices, card.track) : undefined;
  const cachedUrl = card ? sentenceAudioUrl(card.track, card.sentence.source) : null;

  useEffect(() => {
    const recorder = new LocalRecorder(setRecording);
    recorderRef.current = recorder;
    return () => {
      recorder.dispose();
      if (recorderRef.current === recorder) recorderRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => onAppInactive(() => recorderRef.current?.interrupt()), []);

  useEffect(() => {
    if (!Number.isSafeInteger(unitId) || unitId < 1) return;
    const controller = new AbortController();
    apiClient.unitStudy(unitId, controller.signal).then((content) => {
      setDetail(content);
      setIndex(0);
      setError("");
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Promise rejection is an untyped I/O boundary.
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "말하기 카드를 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, [retryKey, unitId]);

  const clearMedia = useCallback(() => {
    recorderRef.current?.discard();
    audioRef.current?.pause();
    audioRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const back = useCallback(() => {
    clearMedia();
    navigate("/home");
  }, [clearMedia, navigate]);

  const move = useCallback((next: number) => {
    clearMedia();
    setIndex(next);
    setPass(1);
  }, [clearMedia]);

  const repeat = useCallback(() => {
    clearMedia();
    setPass((value) => Math.min(value + 1, PASS_TARGET));
  }, [clearMedia]);

  const playReference = useCallback(() => {
    if (!card) return;
    audioRef.current?.pause();
    audioRef.current = null;
    const fallback = () => {
      if (!voice) return;
      const utterance = new SpeechSynthesisUtterance(card.sentence.text);
      utterance.lang = speechLanguages[card.track];
      utterance.voice = voice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Browser audio constructor capability probe.
    if (!cachedUrl || typeof Audio !== "function") { fallback(); return; }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const audio = new Audio(cachedUrl);
    audioRef.current = audio;
    let failed = false;
    const release = () => { if (audioRef.current === audio) audioRef.current = null; };
    const fallbackOnce = () => { if (!failed && audioRef.current === audio) { failed = true; release(); fallback(); } };
    audio.addEventListener("error", fallbackOnce, { once: true });
    audio.addEventListener("ended", release, { once: true });
    void audio.play().catch(fallbackOnce);
  }, [card, cachedUrl, voice]);

  const toggleRecording = useCallback(() => {
    if (recording.status === "recording") { recorderRef.current?.stop(); return; }
    if (recording.status === "requesting" || recording.status === "unsupported") return;
    void recorderRef.current?.record();
  }, [recording.status]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); back(); return; }
      if (event.target instanceof HTMLElement && event.target.matches("button, a, select, audio")) return;
      if (event.key === " ") { event.preventDefault(); playReference(); return; }
      if (event.key === "r" || event.key === "R") { event.preventDefault(); toggleRecording(); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); if (index + 1 < cards.length) move(index + 1); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); if (index > 0) move(index - 1); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [back, cards.length, index, move, playReference, toggleRecording]);

  const retry = () => {
    clearMedia();
    setDetail(null);
    setError("");
    setRetryKey((value) => value + 1);
  };

  if (!Number.isSafeInteger(unitId) || unitId < 1) return <section className="speaking-empty"><button onClick={back} type="button">← 학습 지도로 (Esc)</button><p role="alert">유닛 번호가 올바르지 않습니다.</p></section>;
  if (error) return <section className="speaking-empty"><button onClick={back} type="button">← 학습 지도로 (Esc)</button><h1>말하기 연습</h1><p role="alert">{error}</p><button onClick={retry} type="button">다시 시도</button></section>;
  if (!detail) return <p>말하기 카드를 불러오는 중…</p>;
  if (!card) return <section className="speaking-empty"><button onClick={back} type="button">← 학습 지도로 (Esc)</button><h1>말하기 연습</h1><p>이 유닛에는 읽기가 확인된 일본어·중국어 예문이 없습니다.</p></section>;

  const theme = trackThemes[card.track];
  // SAFETY: These are CSS custom properties omitted from React's CSSProperties type.
  return (
    <section className="speaking-session" data-speaking-track={card.track} style={{ "--speaking-accent": theme.accent, "--speaking-accent-text": theme.accentText, "--speaking-soft": theme.soft, "--speaking-font": theme.font } as CSSProperties}>
      <header className="speaking-session__chrome">
        <button onClick={back} type="button">끝내기 (Esc)</button>
        <div aria-label={`말하기 카드 ${index + 1}/${cards.length}`} aria-valuemax={cards.length} aria-valuemin={1} aria-valuenow={index + 1} className="speaking-session__progress" role="progressbar"><span style={{ width: `${(index + 1) / cards.length * 100}%` }} /></div>
        <strong>{index + 1}/{cards.length}</strong>
      </header>
      <article className="speaking-card">
        <div className="speaking-card__badge">{theme.badge} · {detail.unit.level}</div>
        <p aria-label={`반복 연습 ${pass}번째, 총 ${PASS_TARGET}번`} className="speaking-card__pass">반복 연습 · {pass}번째 / {PASS_TARGET}번</p>
        <h1>듣고 말해 보세요</h1>
        <p className="speaking-card__sentence" lang={theme.lang}>{card.sentence.text}</p>
        <p className="speaking-card__reading" lang={theme.lang}>{card.sentence.reading}</p>
        {card.sentence.translation !== card.sentence.text && <p className="speaking-card__translation" lang="ko">{card.sentence.translation}</p>}
        <small className="speaking-card__source">예문 · <SourceAttribution source={card.sentence.source} /></small>
        <div className="speaking-card__compare">
          <button disabled={!cachedUrl && !voice} onClick={playReference} type="button">{pass > 1 ? "참고 음성 다시 듣기" : "참고 음성 듣기"}</button>
          <button onClick={repeat} type="button">다시 말하기</button>
          {!cachedUrl && !voice && <span>이 기기에는 {card.track === "jp" ? "일본어" : "중국어"} 음성이 없습니다.</span>}
          {recording.status === "ready" && <audio aria-label="내 녹음 재생" controls src={recording.url} />}
        </div>
        <div aria-live="polite" className="speaking-card__recording">
          {recording.status === "unsupported" && <p role="alert">이 브라우저는 로컬 녹음을 지원하지 않습니다.</p>}
          {recording.status === "denied" && <p role="alert">마이크 권한이 거부되었습니다. 브라우저 권한을 확인해 주세요.</p>}
          {recording.status === "error" && <p role="alert">녹음을 만들지 못했습니다. 다시 시도해 주세요.</p>}
          {recording.status === "no_audio" && <p role="alert">음성이 감지되지 않았습니다. 다시 시도해 주세요.</p>}
          {recording.status === "interrupted" && <p role="alert">녹음이 중단되었습니다. 다시 시도해 주세요.</p>}
          {recording.status === "requesting" && <p>마이크 권한을 확인하는 중…</p>}
          {recording.status === "recording" && <p>녹음 중 · 최대 15초</p>}
          {recording.status === "recording" ? <button onClick={() => recorderRef.current?.stop()} type="button">녹음 중지</button> : recording.status === "ready" ? <>
            <button onClick={() => void recorderRef.current?.record()} type="button">다시 녹음</button>
            <button onClick={() => recorderRef.current?.discard()} type="button">녹음 삭제</button>
          </> : <button disabled={recording.status === "requesting" || recording.status === "unsupported"} onClick={() => void recorderRef.current?.record()} type="button">{recording.status === "denied" || recording.status === "error" || recording.status === "no_audio" || recording.status === "interrupted" ? "녹음 다시 시도" : "녹음 시작"}</button>}
        </div>
        <p className="speaking-card__privacy">녹음은 이 화면의 메모리에만 머물며 저장·전송·채점되지 않습니다.</p>
      </article>
      <footer className="speaking-session__navigation">
        <button disabled={index === 0} onClick={() => move(index - 1)} type="button">이전</button>
        {pass < PASS_TARGET && <span className="speaking-session__hint">{PASS_TARGET}번 반복하면 유창성 연습이 됩니다</span>}
        {index + 1 < cards.length ? <button onClick={() => move(index + 1)} type="button">다음</button> : <button onClick={back} type="button">연습 끝내기</button>}
      </footer>
    </section>
  );
}
