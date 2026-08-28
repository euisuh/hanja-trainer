import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { loadOnboardingProfile } from "../features/onboarding/tracks";
import { demoCharacters } from "../features/session/demoData";
import type { PlacementResult } from "../features/placement/adaptive";
import type { TrackEntry } from "../shared/types";
import "../features/onboarding/onboarding.css";

const labels = { kr: "한자 · 급수", jp: "漢検 · JLPT", cn: "HSK · 汉字" } as const;

function nearestEntry(result: PlacementResult): TrackEntry | undefined {
  return demoCharacters
    .flatMap((character) => character.tracks)
    .filter((entry) => entry.track === result.track)
    .sort((a, b) => Math.abs(a.levelOrd - result.levelOrd) - Math.abs(b.levelOrd - result.levelOrd))[0];
}

function resultCopy(result: PlacementResult) {
  const entry = nearestEntry(result);
  if (!entry) return { level: `${result.levelOrd}`, detail: `정확도 ${result.accuracy}%` };
  if (entry.track === "kr") return { level: entry.level, detail: `${result.correct}/${result.total}문항 정확 · ${entry.level} 시작` };
  if (entry.track === "jp") return { level: entry.kanken, detail: `音読み 정확도 ${result.accuracy}% · ${entry.jlpt} 수준` };
  return { level: entry.hsk, detail: `拼音 정확도 ${result.accuracy}% · ${entry.tier}` };
}

export function PlacementResultScreen() {
  const navigate = useNavigate();
  const profile = loadOnboardingProfile();
  const goHome = () => navigate("/home");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || (event.target instanceof HTMLElement && event.target.matches("button, a"))) return;
      event.preventDefault();
      navigate("/home");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  if (!profile.completed || profile.placement.length === 0) return <Navigate replace to="/onboarding" />;
  return (
    <section className="placement-result">
      <p className="onboarding-eyebrow">Step 2 / 2 · 배치 결과</p>
      <h1>시작 지점이 정해졌습니다.</h1>
      <div className="placement-result__grid">
        {profile.placement.map((result) => {
          const copy = resultCopy(result);
          return (
            <article className={`placement-result__card placement-result__card--${result.track}`} key={result.track}>
              <small>{labels[result.track]}</small>
              <strong>{copy.level}</strong>
              <span>{copy.detail}</span>
            </article>
          );
        })}
      </div>
      <button className="placement-result__cta" onClick={goHome} type="button">학습 지도로 <kbd>ENTER</kbd></button>
    </section>
  );
}
