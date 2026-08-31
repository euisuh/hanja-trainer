import { useEffect, useState } from "react";
import type { Track } from "../../shared/types";

export const speechLanguages: Record<Track, "ko-KR" | "ja-JP" | "zh-CN"> = {
  kr: "ko-KR",
  jp: "ja-JP",
  cn: "zh-CN",
};

export function matchingVoice<T extends { lang: string }>(voices: readonly T[], track: Track): T | undefined {
  const target = speechLanguages[track].toLowerCase();
  return voices.find((voice) => voice.lang.replace("_", "-").toLowerCase() === target);
}

export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}
