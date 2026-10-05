import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ConversationProgressResponse } from "../../shared/api";
import { apiClient } from "../lib/apiClient";
import { SourceAttribution } from "../features/source/SourceAttribution";
import "../features/conversation/talkHome.css";

export function TalkContentsScreen() {
  const [progress, setProgress] = useState<ConversationProgressResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    apiClient.conversationProgress(controller.signal).then(setProgress).catch((caught: Error) => {
      if (!controller.signal.aborted) setError(caught.message);
    });
    return () => controller.abort();
  }, []);
  async function checkIn(unitId: number, note: string) {
    try {
      const checkin = await apiClient.saveConversationCheckin({ unitId, note });
      setProgress((current) => current === null ? current : {
        ...current,
        units: current.units.map((unit) => unit.id === unitId ? { ...unit, checkin } : unit),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "체크인을 저장하지 못했습니다.");
    }
  }
  const weak = useMemo(() => progress?.phrases.filter((phrase) => phrase.againCount >= 2) ?? [], [progress]);
  if (error) return <section className="talk-root talk-home"><p role="alert">{error}</p></section>;
  if (!progress) return <section className="talk-root talk-home"><p>목차를 불러오는 중…</p></section>;
  return <section className="talk-root talk-home talk-contents">
    <header className="talk-home__header"><span>JP · Talk</span><nav aria-label="Talk 탐색"><Link to="/talk">Index</Link><Link aria-current="page" to="/talk/contents">Contents</Link><Link to="/talk/diary">Diary</Link></nav></header>
    <main className="talk-home__content"><h1>Contents</h1>
      {progress.units.map((unit) => <section className="talk-contents__unit" key={unit.id}>
        <h2>{unit.titleKo}<small>{unit.completedPhraseCount} / {unit.phraseCount}</small></h2>
        <p>{unit.goalKo}</p>
        <form className="talk-contents__checkin" onSubmit={(event) => { event.preventDefault(); /* SAFETY: this form always has a text input named note. */ checkIn(unit.id, new FormData(event.currentTarget).get("note") as string); }}>
          <label><input checked={unit.checkin !== null} disabled={unit.checkin !== null} onChange={(event) => { if (event.target.checked) event.currentTarget.form?.requestSubmit(); }} type="checkbox" /> 실제로 해봤다</label>
          <input aria-label={`${unit.titleKo} 체크인 메모`} defaultValue={unit.checkin?.note ?? ""} disabled={unit.checkin !== null} maxLength={280} name="note" placeholder="한 줄 메모" />
        </form>
        <ol>{progress.phrases.filter((phrase) => phrase.unitId === unit.id).map((phrase) => <li key={phrase.id}><span className={phrase.spokenDays >= 2 ? "talk-contents__tick is-complete" : "talk-contents__tick"} aria-label={phrase.spokenDays >= 2 ? "두 날짜에 말함" : "아직 두 날짜에 말하지 않음"}>{phrase.spokenDays >= 2 && <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" /></svg>}</span><span><strong lang="ja">{phrase.ja}</strong><small lang="ja">{phrase.kana}</small><em>{phrase.koCue}</em><small>출처 · <SourceAttribution source={phrase.sourceRef} /></small></span></li>)}</ol>
      </section>)}
      <section className="talk-contents__weak"><h2>Weak pages</h2>{weak.length === 0 ? <p>다시 평가한 문장이 아직 없습니다.</p> : <ul>{weak.map((phrase) => <li key={phrase.id}><strong lang="ja">{phrase.ja}</strong> · {phrase.koCue} · <SourceAttribution source={phrase.sourceRef} /></li>)}</ul>}</section>
    </main>
  </section>;
}
