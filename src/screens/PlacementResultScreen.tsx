import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { trackThemes } from "../features/tracks/trackTheme";
import type { PlacementScoreResponse } from "../shared/api";
import "../features/onboarding/onboarding.css";

const labels = { kr: "한자 · 급수", jp: "漢検 · JLPT", cn: "HSK · 汉字" } as const;

export function PlacementResultScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const results = (location.state as PlacementScoreResponse | null)?.results;
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

  if (!results || results.length === 0) return <Navigate replace to="/home" />;
  return (
    <section className="placement-result">
      <p className="onboarding-eyebrow">Step 2 / 2 · 배치 결과</p>
      <h1>시작 지점이 정해졌습니다.</h1>
      <div className="placement-result__grid">
        {results.map((result) => (
            <article className={`placement-result__card placement-result__card--${result.track}`} key={result.track}>
              <small lang={trackThemes[result.track].lang}>{labels[result.track]}</small>
              <strong lang={trackThemes[result.track].lang}>{result.levelBadge}</strong>
              <span>{result.detail}</span>
            </article>
        ))}
      </div>
      <button className="placement-result__cta" onClick={goHome} type="button">학습 지도로 <kbd>ENTER</kbd></button>
    </section>
  );
}
