import { useState } from "react";
import "./landing.css";

const specimen = [
  { track: "kr", glyph: "學", reading: "학", label: "Korean Hanja", lang: "ko" },
  { track: "jp", glyph: "学", reading: "ガク", label: "Japanese Kanji", lang: "ja" },
  { track: "cn", glyph: "学", reading: "xué", label: "Chinese Hanzi", lang: "zh" },
] as const;

const features = [
  { title: "간격 반복 복습", body: "FSRS 알고리즘이 잊을 때가 된 글자를 골라 복습 순서를 정합니다." },
  { title: "Talk 모드", body: "장면별 일본어 회화 문장을 소리 내어 말하며 연습합니다." },
  { title: "통계", body: "연속 학습일, 하루 목표, 트랙별 숙달도를 한 화면에서 봅니다." },
] as const;

export function Landing({ onDemo, onSignIn }: { onDemo: () => Promise<void>; onSignIn: () => void }) {
  const [pending, setPending] = useState(false);

  async function tryDemo() {
    setPending(true);
    try {
      await onDemo();
    } catch {
      // The sign-in screens repeat the guest option and show why it failed on retry.
      onSignIn();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="landing">
      <header className="landing__brand">漢字 Trainer</header>
      <section className="landing__hero" aria-labelledby="landing-title">
        <div className="landing__intro">
          <h1 id="landing-title">한 글자, 세 발음</h1>
          <p>한국 한자, 일본 한자, 중국 한자를 같은 글자 하나로 나란히 배웁니다.</p>
          <div className="landing__actions">
            <button className="landing__primary" disabled={pending} onClick={() => void tryDemo()} type="button">Continue as guest</button>
            <button className="landing__secondary" onClick={onSignIn} type="button">Sign in</button>
          </div>
        </div>
        <ul className="landing__specimen" aria-label="學 한 글자의 세 가지 읽기">
          {specimen.map((item) => (
            <li data-track={item.track} key={item.track}>
              <span className="landing__glyph" lang={item.lang}>{item.glyph}</span>
              <strong lang={item.lang}>{item.reading}</strong>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </section>
      <ul className="landing__features">
        {features.map((feature) => (
          <li key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </li>
        ))}
      </ul>
      <footer className="landing__stack">Cloudflare Workers, D1, R2, React/Vite, Capacitor로 만들었습니다.</footer>
    </main>
  );
}
