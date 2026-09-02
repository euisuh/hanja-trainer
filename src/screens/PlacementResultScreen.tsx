import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { trackThemes } from "../features/tracks/trackTheme";
import type { PlacementScoreResponse } from "../shared/api";
import "../features/onboarding/onboarding.css";

const labels = { kr: "한자 · 급수", jp: "JLPT · 漢検", cn: "HSK · 汉字" } as const;
const saturatedLabels = { kr: "측정 범위 상한", jp: "測定範囲の上限", cn: "测量范围上限" } as const;
const flooredLabels = { kr: "처음부터 시작", jp: "最初から開始", cn: "从头开始" } as const;

export function PlacementResultScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as (PlacementScoreResponse & { returnTo?: unknown }) | null;
  const results = state?.results;
  const returnTo = state?.returnTo === "/settings" ? "/settings" : "/home";
  const goBack = () => navigate(returnTo, { replace: returnTo === "/settings" });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || (event.target instanceof HTMLElement && event.target.matches("button, a"))) return;
      event.preventDefault();
      navigate(returnTo, { replace: returnTo === "/settings" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, returnTo]);

  if (!results || results.length === 0) return <Navigate replace to={returnTo} />;
  const allSaturated = results.every((result) => result.saturated);
  return (
    <section className="placement-result">
      <p className="onboarding-eyebrow">{returnTo === "/settings" ? "커리큘럼 · 재측정 결과" : "Step 2 / 2 · 배치 결과"}</p>
      <h1>{allSaturated ? "현재 콘텐츠의 끝까지 도달했습니다." : "시작 지점이 정해졌습니다."}</h1>
      <div className="placement-result__grid">
        {results.map((result) => (
            <article className={`placement-result__card placement-result__card--${result.track}`} key={result.track}>
              <small lang={trackThemes[result.track].lang}>{labels[result.track]}</small>
              <strong lang={trackThemes[result.track].lang}>{result.saturated ? saturatedLabels[result.track] : result.floored ? flooredLabels[result.track] : result.levelBadge}</strong>
              <span>{result.detail}</span>
            </article>
        ))}
      </div>
      <button className="placement-result__cta" onClick={goBack} type="button">{returnTo === "/settings" ? "설정으로" : "학습 지도로"} <kbd>ENTER</kbd></button>
    </section>
  );
}
