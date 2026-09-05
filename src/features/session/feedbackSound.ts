// ponytail: WebAudio oscillators, no audio files. Swap for sampled assets
// only if the synthesized tones prove too thin.
let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context ??= new Ctor();
  } catch {
    return null;
  }
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return context;
}

function tone(frequency: number, startAt: number, durationMs: number, peak: number): void {
  const ctx = ensureContext();
  if (!ctx) return;
  const start = ctx.currentTime + startAt / 1000;
  const end = start + durationMs / 1000;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

/** Rising two-note chime; pitch climbs with the combo so the streak is audible. */
export function playCorrect(combo: number): void {
  const step = Math.min(combo, 8);
  const root = 523.25 * 2 ** (step / 24);
  tone(root, 0, 110, 0.14);
  tone(root * 1.5, 70, 190, 0.12);
  if (combo >= 6) tone(root * 2, 150, 220, 0.09);
}

/** Short, low, dull — must not sting. */
export function playWrong(): void {
  tone(174.61, 0, 90, 0.10);
  tone(146.83, 60, 150, 0.08);
}

export function playSkip(): void {
  tone(220, 0, 120, 0.06);
}
