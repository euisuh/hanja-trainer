export const SHORTCUTS = [
  { id: "answers", keys: "1 – 4", description: "보기 선택" },
  { id: "skip", keys: "0", description: "모름" },
  { id: "advance", keys: "Enter / Space", description: "확인 · 다음 카드" },
  { id: "escape", keys: "Esc / Q", description: "세션 일시정지 / 뒤로 · 종료" },
  { id: "map", keys: "↑ ↓", description: "학습 지도 노드 이동" },
  { id: "tracks", keys: "← →", description: "트랙 전환 (KR / JP / CN)" },
  { id: "detail", keys: "D", description: "선택한 글자 상세 열기" },
  {
    id: "navigation", keys: "H R T ,", description: "지도 · 복습 · 통계 · 설정",
    destinations: { h: "/home", r: "/review", t: "/stats", ",": "/settings" },
  },
] as const;

const navigation = SHORTCUTS.find((shortcut) => shortcut.id === "navigation");
export const GLOBAL_DESTINATIONS: Record<string, string> = navigation?.destinations ?? {};
