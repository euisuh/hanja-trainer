import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ConversationPhraseProgress, ConversationProgressResponse } from "../../shared/api";
import { apiClient } from "../lib/apiClient";
import "../features/conversation/talkHome.css";

function nextPhrase(progress: ConversationProgressResponse): ConversationPhraseProgress | undefined {
  return progress.phrases.find((phrase) => phrase.spokenDays < 2) ?? progress.phrases[0];
}

export function TalkHomeScreen() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ConversationProgressResponse | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiClient.conversationProgress(controller.signal).then(setProgress).catch((caught: Error) => {
      if (!controller.signal.aborted) setError(caught.message);
    });
    return () => controller.abort();
  }, []);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const units = useMemo(() => progress?.units.filter((unit) => {
    if (!normalizedQuery) return true;
    const phrases = progress.phrases.filter((phrase) => phrase.unitId === unit.id);
    return [unit.titleKo, unit.goalKo, ...phrases.flatMap((phrase) => [phrase.ja, phrase.kana, phrase.koCue])]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  }) ?? [], [normalizedQuery, progress]);
  const next = progress && nextPhrase(progress);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement) return;
      if (event.key === "/") { event.preventDefault(); searchRef.current?.focus(); return; }
      if (event.key.toLowerCase() === "c") { event.preventDefault(); navigate("/talk/contents"); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedUnit((current) => Math.max(0, Math.min(units.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const unit = units[selectedUnit] ?? (next ? progress?.units.find((item) => item.id === next.unitId) : undefined);
        if (unit) navigate(`/talk/${unit.id}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, next, progress, selectedUnit, units]);
  if (error) return <section className="talk-root talk-home"><p role="alert">{error}</p></section>;
  if (!progress) return <section className="talk-root talk-home"><p>Talk 페이지를 불러오는 중…</p></section>;
  return <section className="talk-root talk-home">
    <header className="talk-home__header"><span>JP · Talk</span><nav aria-label="Talk 탐색"><Link aria-current="page" to="/talk">Index</Link><Link to="/talk/contents">Contents <kbd>C</kbd></Link><Link to="/talk/diary">Diary</Link></nav></header>
    <div className="talk-home__tabs" aria-label="상황 목록">
      {progress.units.map((unit) => <a href={`#unit-${unit.id}`} key={unit.id}>{unit.titleKo}</a>)}
    </div>
    <main className="talk-home__content">
      <h1>Index</h1>
      {next ? <section className="talk-home__next" aria-label="다음 문장">
        <span>Next page · #{next.ord}</span><strong>{next.koCue}</strong><p>{progress.units.find((unit) => unit.id === next.unitId)?.titleKo}</p>
        <button onClick={() => navigate(`/talk/${next.unitId}`)} type="button">계속하기 <kbd>Enter</kbd></button>
      </section> : <p>아직 Talk 문장이 없습니다.</p>}
      <label className="talk-home__search">찾기 <kbd>/</kbd><input onChange={(event) => { setQuery(event.target.value); setSelectedUnit(0); }} placeholder="상황 또는 문장" ref={searchRef} type="search" value={query} /></label>
      <section aria-label="Talk 단원" className="talk-home__units">
        {units.map((unit, index) => <button aria-current={index === selectedUnit ? "true" : undefined} id={`unit-${unit.id}`} key={unit.id} onClick={() => navigate(`/talk/${unit.id}`)} onFocus={() => setSelectedUnit(index)} type="button">
          <span>p.{unit.ord}</span><strong>{unit.titleKo}</strong><p>{unit.goalKo}</p><em>{unit.completedPhraseCount} / {unit.phraseCount} phrases</em>
        </button>)}
      </section>
    </main>
  </section>;
}
