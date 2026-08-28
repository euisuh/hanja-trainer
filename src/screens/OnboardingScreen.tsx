import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { loadOnboardingProfile, saveEnabledTracks } from "../features/onboarding/tracks";
import { TRACKS, type Track } from "../shared/types";
import "../features/onboarding/onboarding.css";

const cards = {
  kr: { glyph: "漢", name: "한국 · 한자", detail: "한자능력검정 8급 → 특급", key: "1" },
  jp: { glyph: "漢", name: "日本 · 漢字", detail: "漢検 10級 → 1級 · JLPT N5→N1", key: "2" },
  cn: { glyph: "汉", name: "中国 · 汉字", detail: "HSK 1 → 7-9 · 通用规范汉字表", key: "3" },
} as const;

export function OnboardingScreen() {
  const profile = loadOnboardingProfile();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState<Track[]>(profile.enabledTracks);

  function toggle(track: Track) {
    setEnabled((current) => current.includes(track)
      ? current.length === 1 ? current : current.filter((candidate) => candidate !== track)
      : [...current, track]);
  }

  function start() {
    saveEnabledTracks(enabled);
    navigate("/placement");
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (/^[1-3]$/u.test(event.key)) {
        event.preventDefault();
        toggle(TRACKS[Number(event.key) - 1]);
      } else if (event.key === "Enter" && !(event.target instanceof HTMLElement && event.target.matches("button, a"))) {
        event.preventDefault();
        saveEnabledTracks(enabled);
        navigate("/placement");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, navigate]);

  if (profile.completed) return <Navigate replace to="/home" />;
  return (
    <section className="onboarding-screen">
      <p className="onboarding-eyebrow">Step 1 / 2 · 트랙 선택</p>
      <h1>한 글자, 세 개의 시험.</h1>
      <p className="onboarding-copy">같은 글자를 급수·漢検·HSK 세 기준으로 동시에 학습합니다. 학습할 트랙을 고르세요. 숫자키 <b>1</b>–<b>3</b>으로 토글, <b>Enter</b>로 계속.</p>
      <div className="track-picker">
        {TRACKS.map((track) => {
          const card = cards[track];
          const checked = enabled.includes(track);
          return (
            <button aria-pressed={checked} className={`track-card track-card--${track}${checked ? " track-card--checked" : ""}`} key={track} onClick={() => toggle(track)} type="button">
              <span className="track-card__top"><span className="track-card__glyph">{card.glyph}</span><span aria-hidden="true" className="track-card__check">{checked ? "✓" : ""}</span></span>
              <strong>{card.name}</strong>
              <span className="track-card__detail">{card.detail}</span>
              <kbd>{card.key}</kbd>
            </button>
          );
        })}
      </div>
      <button className="onboarding-cta" onClick={start} type="button">배치 테스트 시작 <kbd>ENTER</kbd></button>
      <p className="onboarding-footnote">약 15문항 적응형 · 이미 아는 급수는 건너뜁니다.</p>
    </section>
  );
}
