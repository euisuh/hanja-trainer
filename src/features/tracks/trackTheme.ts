import { tracks } from "../../design/tokens";
import type { Track } from "../../shared/types";

export type TrackTheme = {
  label: string;
  badge: string;
  accent: string;
  soft: string;
  font: string;
  prompt: string;
  scaleTotal: number;
  scaleGoal: string;
  scaleNote: string;
  unit: string;
  title: string;
};

export const trackThemes: Record<Track, TrackTheme> = {
  kr: {
    label: "한자 · 급수", badge: "한국 · 한자", ...tracks.kr, prompt: "훈음을 고르세요",
    scaleTotal: 1_000, scaleGoal: "한자 3급", scaleNote: "현재 7급 · 다음 관문 6급 (150자 남음)",
    unit: "8급 · UNIT 3", title: "자연과 사람",
  },
  jp: {
    label: "漢字 · 漢検", badge: "日本 · 漢字", ...tracks.jp, prompt: "音読みを選べ",
    scaleTotal: 640, scaleGoal: "漢検 8級", scaleNote: "現在 9級 · JLPT N4 相当",
    unit: "10級 · UNIT 3", title: "自然と人",
  },
  cn: {
    label: "汉字 · HSK", badge: "中国 · 汉字", ...tracks.cn, prompt: "选择正确的拼音",
    scaleTotal: 900, scaleGoal: "HSK 4", scaleNote: "当前 HSK 2 · 声调是弱点",
    unit: "HSK 1 · UNIT 3", title: "自然与人",
  },
};
