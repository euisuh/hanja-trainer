import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TalkDiaryCalendar } from "../features/conversation/TalkDiaryCalendar";
import "../features/conversation/talkDiary.css";
import { apiClient } from "../lib/apiClient";
import type { ConversationStatsResponse } from "../../shared/api";

function value(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${Math.round(value * 100)}${suffix}`;
}

export function TalkDiaryScreen() {
  const [stats, setStats] = useState<ConversationStatsResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    apiClient.conversationStats(controller.signal).then(setStats).catch((caught: Error) => {
      if (!controller.signal.aborted) setError(caught.message);
    });
    return () => controller.abort();
  }, []);
  if (error) return <section className="talk-root talk-diary"><h1>Talk diary</h1><p role="alert">{error}</p></section>;
  if (!stats) return <p>말하기 기록을 불러오는 중…</p>;
  return (
    <section className="talk-root talk-diary">
      <Link className="talk-diary__back" to="/home">← 돌아가기</Link>
      <h1>Talk diary</h1>
      <TalkDiaryCalendar calendar={stats.calendar} spokenDaysThisWeek={stats.spokenDaysThisWeek} />
      <div className="talk-diary__metrics">
        <article className="talk-diary__metric"><strong>기억한 말</strong><span>{stats.spokenChunkRetention ?? "—"}</span></article>
        <article className="talk-diary__metric"><strong>첫 시도</strong><span>{value(stats.unaidedFirstTryRate, "%")}</span></article>
        <article className="talk-diary__metric"><strong>말문 열기</strong><span>{stats.medianOnsetLatencyMs === null ? "—" : `${stats.medianOnsetLatencyMs}ms`}</span></article>
        <article className="talk-diary__metric"><strong>새 장면 활용</strong><span>{value(stats.transferRate, "%")}</span></article>
      </div>
    </section>
  );
}
