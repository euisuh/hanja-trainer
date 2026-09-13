import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HighlightedSentence } from "../features/source/HighlightedSentence";
import { SourceAttribution } from "../features/source/SourceAttribution";
import { cachedAudioUrl, matchingVoice, speechLanguages, useSpeechVoices } from "../features/study/speech";
import { useSettings } from "../features/settings/useSettings";
import { trackThemes } from "../features/tracks/trackTheme";
import { apiClient } from "../lib/apiClient";
import { toHiragana } from "../../shared/kana";
import { joinSpokenReadings } from "../../shared/spokenReading";
import type { UnitStudyResponse, UnitStudyTrackDetail } from "../../shared/api";
import type { Track } from "../../shared/types";
import "../features/study/study.css";

const labels = { kr: "한국 · 훈음", jp: "日本 · 音/訓", cn: "中国 · 拼音" } as const;

function SpeakerIcon() {
  return <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zm-2.5-8v2.1a6.5 6.5 0 010 11.8V20a8.5 8.5 0 000-16z" /></svg>;
}

function AudioControl({ children, label, onPlay, supported }: { children: ReactNode; label: string; onPlay: () => void; supported: boolean }) {
  if (!supported) return <div data-study-control tabIndex={0}>{children}</div>;
  return <button aria-label={label} className="unit-study__audio" data-study-audio data-study-control onClick={onPlay} type="button"><span>{children}</span><SpeakerIcon /></button>;
}

function speechReading(entry: UnitStudyTrackDetail, hiragana: boolean): string {
  const main = entry.track === "jp" && hiragana ? toHiragana(entry.reading) : entry.reading;
  return joinSpokenReadings(main, entry.subreading);
}

export function UnitStudyScreen() {
  const { unitId: rawUnitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const { enabledTracks, onyomiScript, error: settingsError, ready, retry: retrySettings } = useSettings();
  const [detail, setDetail] = useState<UnitStudyResponse | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voices = useSpeechVoices();
  const unitId = Number(rawUnitId);
  const voiceByTrack = useMemo(() => new Map(enabledTracks.flatMap((track) => {
    const voice = matchingVoice(voices, track);
    return voice ? [[track, voice] as const] : [];
  })), [enabledTracks, voices]);
  const tracks = enabledTracks;
  const back = useCallback(() => navigate("/home"), [navigate]);

  useEffect(() => {
    if (!ready || !Number.isSafeInteger(unitId) || unitId < 1) return;
    const controller = new AbortController();
    apiClient.unitStudy(unitId, controller.signal).then((content) => { setDetail(content); setError(""); }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "학습 목록을 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, [ready, retryKey, unitId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); back(); return; }
      if (!event.key.startsWith("Arrow")) return;
      const controls = [...document.querySelectorAll<HTMLElement>("[data-study-control]")];
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (index < 0 || controls.length < 2) return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      controls[(index + direction + controls.length) % controls.length].focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [back]);

  useLayoutEffect(() => () => {
    const audio = audioRef.current;
    audioRef.current = null;
    audio?.pause();
  }, []);

  const speak = useCallback((text: string, track: Track, key?: string) => {
    audioRef.current?.pause();
    audioRef.current = null;
    const voice = voiceByTrack.get(track);
    const fallback = () => {
      if (!voice) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = speechLanguages[track];
      utterance.voice = voice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };
    if (!key || typeof Audio !== "function") { fallback(); return; }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const audio = new Audio(cachedAudioUrl(track, key));
    audioRef.current = audio;
    let failed = false;
    const release = () => { if (audioRef.current === audio) audioRef.current = null; };
    const fallbackOnce = () => { if (!failed && audioRef.current === audio) { failed = true; release(); fallback(); } };
    audio.addEventListener("error", fallbackOnce, { once: true });
    audio.addEventListener("ended", release, { once: true });
    void audio.play().catch(fallbackOnce);
  }, [voiceByTrack]);

  if (!Number.isSafeInteger(unitId) || unitId < 1) return <section><button className="unit-study__back" onClick={back} type="button">← 뒤로 (Esc)</button><p role="alert">유닛 번호가 올바르지 않습니다.</p></section>;
  if (settingsError) return <section><button className="unit-study__back" onClick={back} type="button">← 뒤로 (Esc)</button><p role="alert">설정을 불러오지 못했습니다. {settingsError}</p><button onClick={retrySettings} type="button">다시 시도</button></section>;
  if (error) return <section><button className="unit-study__back" onClick={back} type="button">← 뒤로 (Esc)</button><p role="alert">학습 목록을 불러오지 못했습니다. {error}</p><button onClick={() => { setError(""); setRetryKey((value) => value + 1); }} type="button">다시 시도</button></section>;
  if (!detail) return <p>학습 목록을 불러오는 중…</p>;

  return (
    <section className="unit-study">
      <button className="unit-study__back" onClick={back} type="button">← 학습 지도로 (Esc)</button>
      <header className="unit-study__heading">
        <span>{detail.unit.level} · UNIT {detail.unit.ord}</span>
        <h1>{detail.unit.title}</h1>
        <p>{detail.unit.subtitle} · {detail.characters.length}자를 먼저 보고 들어보세요.</p>
      </header>
      <div className="unit-study__table-wrap">
        <table className="unit-study__table" style={{ minWidth: 110 + tracks.length * 220 }}>
          <thead><tr><th scope="col">글자</th>{tracks.map((track) => <th key={track} lang={trackThemes[track].lang} scope="col">{labels[track]}</th>)}</tr></thead>
          <tbody>{detail.characters.map((character) => {
            const unitEntry = character.tracks.find((entry) => entry.track === detail.unit.track) ?? character.tracks[0];
            return <tr key={character.key}>
              <th className="unit-study__glyph" scope="row" style={{ "--study-font": trackThemes[detail.unit.track].font } as CSSProperties}><strong lang={trackThemes[detail.unit.track].lang}>{unitEntry?.glyph ?? character.key}</strong>{unitEntry && <small lang={unitEntry.track === "kr" ? "ko" : "en"}>{unitEntry.meaning}</small>}</th>
              {tracks.map((track) => {
                const entry = character.tracks.find((candidate) => candidate.track === track);
                const theme = trackThemes[track];
                if (!entry) return <td className="unit-study__track" key={track}>—</td>;
                const reading = speechReading(entry, onyomiScript === "hiragana");
                const displayedReading = entry.track === "jp" && onyomiScript === "hiragana" ? toHiragana(entry.reading) : entry.reading;
                const supported = voiceByTrack.has(track);
                return <td className="unit-study__track" key={track} lang={theme.lang} style={{ "--study-accent": theme.accent, "--study-soft": theme.soft, "--study-font": theme.font } as CSSProperties}>
                  <AudioControl label={`${labels[track]} 읽기 듣기: ${reading}`} onPlay={() => speak(reading, track, character.key)} supported={typeof Audio === "function" || supported}>
                    <span className="unit-study__reading"><span><strong>{displayedReading}</strong>{entry.subreading && <small>{entry.subreading}</small>}</span></span>
                  </AudioControl>
                  <div className="unit-study__badges">{entry.level_badges.map((badge) => <span key={badge}>{badge}</span>)}</div>
                  <p className="unit-study__meaning" lang={entry.track === "kr" ? "ko" : "en"}>{entry.meaning}</p>
                  {entry.sentences.length > 0 ? <div className="unit-study__sentences">{entry.sentences.map((sentence) => <div className="unit-study__sentence" key={`${sentence.target_index}:${sentence.text}`}>
                    <AudioControl label={`${labels[track]} 예문 듣기${sentence.target_index === null ? `, 한자 ${entry.glyph}` : ""}: ${sentence.text}`} onPlay={() => speak(sentence.text, track)} supported={supported}><HighlightedSentence glyph={entry.glyph} targetIndex={sentence.target_index} text={sentence.text} /></AudioControl>
                    {sentence.reading && <small lang={theme.lang}>{sentence.reading}</small>}
                    {sentence.translation !== sentence.text && <small lang="ko">{sentence.translation}</small>}
                    <small className="unit-study__source" lang="ko">예문 · <SourceAttribution source={sentence.source} /></small>
                  </div>)}</div> : <p className="unit-study__empty" lang="ko">확인된 예문이 없습니다.</p>}
                </td>;
              })}
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}
