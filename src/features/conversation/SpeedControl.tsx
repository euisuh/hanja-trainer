import type { PlaybackRate } from "./playbackSpeed";

export type SpeedProps = { speed: PlaybackRate; changeSpeed: () => void };

export function SpeedControl({ speed, changeSpeed }: SpeedProps) {
  return <button aria-label={`재생 속도 ${speed}배, 눌러서 변경`} className="talk-speed" onClick={changeSpeed} type="button">{speed}x</button>;
}
