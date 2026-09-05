import { describe, expect, it, vi } from "vitest";
import { activityDaySql, offsetPeriods } from "./sessions";

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 8, 6, 12);
type OffsetPeriod = { until?: number; offset: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function timezoneOffsetSlow(timestamp: number, timezone: string): number {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return local - Math.floor(timestamp / 1_000) * 1_000;
}

function offsetPeriodsSlow(timezone: string, minAt: number | null, maxAt: number | null): OffsetPeriod[] {
  if (minAt === null || maxAt === null) return [{ offset: 0 }];
  const start = Math.floor(minAt / DAY_MS) * DAY_MS - DAY_MS;
  const end = Math.ceil(maxAt / DAY_MS) * DAY_MS + DAY_MS;
  const periods: OffsetPeriod[] = [];
  let previousAt = start;
  let previousOffset = timezoneOffsetSlow(start, timezone);
  for (let sample = start + DAY_MS; sample <= end; sample += DAY_MS) {
    const nextOffset = timezoneOffsetSlow(sample, timezone);
    if (nextOffset === previousOffset) {
      previousAt = sample;
      continue;
    }
    let low = previousAt;
    let high = sample;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (timezoneOffsetSlow(middle, timezone) === previousOffset) low = middle;
      else high = middle;
    }
    periods.push({ until: high, offset: previousOffset });
    previousOffset = timezoneOffsetSlow(high, timezone);
    previousAt = sample;
  }
  periods.push({ offset: previousOffset });
  return periods;
}

function localDaySqlSlow(column: "answered_at" | "ended_at", periods: OffsetPeriod[]): string {
  const offset = periods.length === 1
    ? String(periods[0].offset)
    : `CASE ${periods.map((period) => period.until === undefined ? `ELSE ${period.offset}` : `WHEN ${column} < ${period.until} THEN ${period.offset}`).join(" ")} END`;
  return `strftime('%Y-%m-%d', (${column} + (${offset})) / 1000.0, 'unixepoch')`;
}

const zones = ["Asia/Seoul", "America/Los_Angeles", "Europe/London", "Australia/Sydney", "Asia/Kathmandu", "America/Sao_Paulo", "UTC"];
const ranges = [
  ["1 day", NOW - DAY_MS],
  ["1 month", Date.UTC(2026, 7, 6, 12)],
  ["1 year", Date.UTC(2025, 8, 6, 12)],
  ["3 years", Date.UTC(2023, 8, 6, 12)],
  ["10 years", Date.UTC(2016, 8, 6, 12)],
] as const;

describe("timezone offset periods", () => {
  it("caches yearly transitions after the first calculation", async () => {
    vi.resetModules();
    const formatToParts = vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts");
    const fresh = await import("./sessions");
    const minAt = Date.UTC(2023, 8, 6, 12);

    fresh.offsetPeriods("America/Los_Angeles", minAt, NOW);
    const coldCalls = formatToParts.mock.calls.length;
    formatToParts.mockClear();
    fresh.offsetPeriods("America/Los_Angeles", minAt, NOW);

    // Four full yearly entries require 52 month samples plus ~32 probes for each of eight transitions.
    expect(coldCalls).toBeLessThanOrEqual(350);
    expect(formatToParts).toHaveBeenCalledTimes(0);
    formatToParts.mockRestore();
  });

  it("matches the former daily scan and its generated SQL", () => {
    for (const timezone of zones) {
      for (const [range, minAt] of ranges) {
        const expected = offsetPeriodsSlow(timezone, minAt, NOW);
        const context = `${timezone}, ${range}`;
        expect(offsetPeriods(timezone, minAt, NOW), context).toEqual(expected);
        expect(activityDaySql(timezone, minAt, NOW), context).toEqual({
          review: localDaySqlSlow("answered_at", expected),
          session: localDaySqlSlow("ended_at", expected),
        });
      }
    }
  });

  it("keeps no-DST zones as one period", () => {
    expect(offsetPeriods("Asia/Seoul", ranges[4][1], NOW)).toEqual([{ offset: 32_400_000 }]);
  });
});
