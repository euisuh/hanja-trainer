import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { IntervalChart } from "../features/detail/IntervalChart";
import { PersonalRecord } from "../features/detail/PersonalRecord";
import { TrackPanel } from "../features/detail/TrackPanel";
import { useSettings } from "../features/settings/useSettings";
import { trackThemes } from "../features/tracks/trackTheme";
import { apiClient, ApiClientError } from "../lib/apiClient";
import type { ApiReviewState, CharacterDetailResponse } from "../shared/api";
import type { Track } from "../shared/types";
import "../features/detail/detail.css";

function variantLine(character: CharacterDetailResponse): string {
  const glyphs = character.tracks.map((entry) => ({ track: entry.track, glyph: entry.glyph }));
  const diverges = new Set(glyphs.map((entry) => entry.glyph)).size > 1;
  return glyphs.map((entry) => diverges ? `${entry.glyph} (${entry.track.toUpperCase()})` : entry.glyph).join(" / ");
}

export function DetailScreen() {
  const { key } = useParams<{ key: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { enabledTracks: enabled } = useSettings();
  const [character, setCharacter] = useState<CharacterDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [now] = useState(() => Date.now());
  const available = character?.tracks.filter((entry) => enabled.includes(entry.track)) ?? [];
  const tracks = available.map((entry) => entry.track);
  const [active, setActive] = useState<Track>(tracks[0] ?? "kr");
  const back = useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? "/home");
  }, [location.state, navigate]);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    apiClient.character(key, controller.signal).then((detail) => {
      setCharacter(detail);
      setNotFound(false);
      setLoadError("");
      setActive(detail.tracks.find((entry) => enabled.includes(entry.track))?.track ?? "kr");
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiClientError && caught.status === 404) setNotFound(true);
      else setLoadError(caught instanceof Error ? caught.message : "글자 정보를 불러오지 못했습니다.");
    });
    return () => controller.abort();
  }, [enabled, key]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        back();
      } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && tracks.length > 0) {
        event.preventDefault();
        setActive((current) => {
          const index = tracks.indexOf(current);
          return tracks[(index + (event.key === "ArrowRight" ? 1 : -1) + tracks.length) % tracks.length];
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [back, tracks]);

  if (notFound) {
    return <section className="detail-not-found"><button className="detail-back" onClick={back} type="button">← 뒤로 (Esc)</button><h1>글자를 찾을 수 없습니다.</h1><p>주소의 글자 키를 확인해 주세요.</p></section>;
  }
  if (loadError) return <section className="detail-not-found"><button className="detail-back" onClick={back} type="button">← 뒤로 (Esc)</button><h1>글자 정보를 불러오지 못했습니다.</h1><p role="alert">{loadError}</p></section>;
  if (!character) return <p>글자 정보를 불러오는 중…</p>;
  const stateByTrack = new Map<Track, ApiReviewState>(available.flatMap((entry) => {
    const state = entry.review_state;
    return state ? [[entry.track, state] as const] : [];
  }));
  const activeState = stateByTrack.get(active);
  return (
    <section className="detail-screen">
      <button className="detail-back" onClick={back} type="button">← 뒤로 (Esc)</button>
      <div className="detail-overview">
        <article className="detail-hero">
          <strong>{character.key}</strong>
          <span>{character.meaning_ko} · {character.meaning_en}</span>
          <small>{variantLine(character)}</small>
        </article>
        <div className="detail-tracks">
          {available.map((entry) => <TrackPanel entry={entry} key={entry.track} />)}
        </div>
      </div>
      {tracks.length === 0 ? <p className="detail-empty detail-empty--standalone">활성화된 트랙에 이 글자가 없습니다.</p> : (
        <div className="detail-history">
          <IntervalChart accent={trackThemes[active].accent} intervals={activeState?.interval_history ?? []} stability={activeState?.stability} />
          <PersonalRecord active={active} now={now} onChange={setActive} states={stateByTrack} tracks={tracks} />
        </div>
      )}
    </section>
  );
}
