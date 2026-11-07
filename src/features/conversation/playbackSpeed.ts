export const allowedRates = [0.75, 1, 1.25] as const;
export type PlaybackRate = typeof allowedRates[number];

export function nextRate(rate: PlaybackRate): PlaybackRate {
  return allowedRates[(allowedRates.indexOf(rate) + 1) % allowedRates.length];
}

export function parseStoredRate(value: string | null): PlaybackRate {
  return allowedRates.find((rate) => String(rate) === value) ?? 1;
}
