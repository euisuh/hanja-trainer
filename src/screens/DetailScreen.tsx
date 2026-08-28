import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { IntervalChart } from "../features/detail/IntervalChart";
import { PersonalRecord } from "../features/detail/PersonalRecord";
import { TrackPanel } from "../features/detail/TrackPanel";
import { variantsLabel } from "../features/detail/detailModel";
import { loadOnboardingProfile } from "../features/onboarding/tracks";
import { demoCharacters, loadDemoLogs, loadDemoStates } from "../features/session/demoData";
import { reviewKey } from "../features/session/buildQueue";
import { trackThemes } from "../features/tracks/trackTheme";
import type { Track } from "../shared/types";
import "../features/detail/detail.css";

export function DetailScreen() {
  const { key } = useParams<{ key: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const character = demoCharacters.find((candidate) => candidate.key === key || Object.values(candidate.variants).includes(key ?? ""));
  const enabled = useMemo(() => loadOnboardingProfile().enabledTracks, []);
  const available = character?.tracks.filter((entry) => enabled.includes(entry.track)) ?? [];
  const tracks = available.map((entry) => entry.track);
  const [active, setActive] = useState<Track>(tracks[0] ?? "kr");
  const reviewStates = useMemo(() => loadDemoStates(), []);
  const back = useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? "/home");
  }, [location.state, navigate]);

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

  if (!character) {
    return <section className="detail-not-found"><button className="detail-back" onClick={back} type="button">← 뒤로 (Esc)</button><h1>글자를 찾을 수 없습니다.</h1><p>주소의 글자 키를 확인해 주세요.</p></section>;
  }
  const stateByTrack = new Map(tracks.flatMap((track) => {
    const state = reviewStates.get(reviewKey(character.id, track));
    return state ? [[track, state] as const] : [];
  }));
  const activeState = stateByTrack.get(active);
  const activeLogs = loadDemoLogs(character.id, active);
  return (
    <section className="detail-screen">
      <button className="detail-back" onClick={back} type="button">← 뒤로 (Esc)</button>
      <div className="detail-overview">
        <article className="detail-hero">
          <strong>{character.key}</strong>
          <span>{character.meaningKo} · {character.meaningEn}</span>
          <small>{variantsLabel(character, character.tracks.map((entry) => entry.track))}</small>
        </article>
        <div className="detail-tracks">
          {available.map((entry) => <TrackPanel entry={entry} key={entry.track} sentences={character.sentences.filter((sentence) => sentence.track === entry.track)} />)}
        </div>
      </div>
      {tracks.length === 0 ? <p className="detail-empty detail-empty--standalone">활성화된 트랙에 이 글자가 없습니다.</p> : (
        <div className="detail-history">
          <IntervalChart accent={trackThemes[active].accent} logs={activeLogs} state={activeState} />
          <PersonalRecord active={active} onChange={setActive} states={stateByTrack} tracks={tracks} />
        </div>
      )}
    </section>
  );
}
