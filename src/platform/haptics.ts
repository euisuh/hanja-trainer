import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

export type HapticCue = "correct" | "combo" | "skip" | "wrong";

const vibrationPatterns: Record<HapticCue, number | number[]> = {
  correct: 18,
  combo: [18, 40, 26],
  skip: 10,
  wrong: [30, 50, 30],
};

// iOS WebViews have no navigator.vibrate, so native shells use the platform haptic engine.
export function buzz(cue: HapticCue): void {
  if (Capacitor.isNativePlatform()) {
    const played = cue === "wrong" ? Haptics.notification({ type: NotificationType.Error })
      : Haptics.impact({ style: cue === "combo" ? ImpactStyle.Medium : ImpactStyle.Light });
    void played.catch(() => undefined);
    return;
  }
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(vibrationPatterns[cue]); } catch { /* Some browsers reject on unfocused documents. */ }
}
