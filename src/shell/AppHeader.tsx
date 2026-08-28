export function AppHeader() {
  return (
    <header className="app-header" aria-label="오늘의 학습 현황">
      <div className="metric"><span aria-hidden="true">🔥</span><strong>23</strong><span>연속</span></div>
      <div className="metric"><span aria-hidden="true">⚡</span><strong>4,820</strong><span>XP</span></div>
      <div className="daily-goal">
        <span className="daily-goal__ring" role="img" aria-label="일일 목표 60% 달성" />
        <strong>오늘 24/40 XP</strong>
      </div>
    </header>
  );
}
