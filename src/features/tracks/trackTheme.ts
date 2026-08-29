import { tracks } from "../../design/tokens";
import type { Track } from "../../shared/types";

export type TrackTheme = {
  label: string;
  badge: string;
  accent: string;
  soft: string;
  font: string;
};

export const trackThemes: Record<Track, TrackTheme> = {
  kr: {
    label: "한자 · 급수", badge: "한국 · 한자", ...tracks.kr,
  },
  jp: {
    label: "漢字 · 漢検", badge: "日本 · 漢字", ...tracks.jp,
  },
  cn: {
    label: "汉字 · HSK", badge: "中国 · 汉字", ...tracks.cn,
  },
};
