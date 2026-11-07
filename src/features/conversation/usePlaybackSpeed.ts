import { useState } from "react";
import { load, set } from "../../platform/storage";
import { nextRate, parseStoredRate } from "./playbackSpeed";

const storageKey = "hanja-trainer:talk-speed";

export function usePlaybackSpeed() {
  const [speed, setSpeed] = useState(() => {
    const stored = load(storageKey).find(([suffix]) => suffix === "")?.[1];
    return parseStoredRate(stored === undefined ? null : String(stored));
  });
  const changeSpeed = () => {
    const next = nextRate(speed);
    set(storageKey, "", next);
    setSpeed(next);
  };
  return { speed, changeSpeed };
}
