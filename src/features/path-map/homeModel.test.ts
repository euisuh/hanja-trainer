import { describe, expect, it } from "vitest";
import { initialState } from "../../shared/fsrs";
import type { CharacterEntry, Track } from "../../shared/types";
import { lessonLimit, lessonTracks } from "../../screens/LessonScreen";
import { reviewKey } from "../../shared/buildQueue";
import { buildPathNodes, MASTERY_STABILITY_DAYS, progressPercent, reviewableLevels, reviewableUnits, reviewLevelOptions, trackImbalance } from "./homeModel";

function character(id: number): CharacterEntry {
  return {
    id, key: `${id}`, meaningEn: "", meaningKo: "", variants: {}, strokeCount: null, createdAt: 0, sentences: [],
    tracks: [{ characterId: id, track: "kr", glyph: `${id}`, reading: `읽기${id}`, level: "8급", levelOrd: 1 }],
  };
}

describe("home path model", () => {
  it("derives done, current, and locked nodes from FSRS stability", () => {
    const mastered = { ...initialState(new Date()), stability: MASTERY_STABILITY_DAYS };
    const nodes = buildPathNodes([character(1), character(2), character(3)], "kr", new Map([[reviewKey(1, "kr"), mastered]]));
    expect(nodes.map((node) => node.state)).toEqual(["done", "current", "locked"]);
    expect(nodes.map((node) => node.label)).toEqual(["읽기1", "읽기2", "잠김"]);
  });

  it("keeps progress finite for empty totals", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(12, 10)).toBe(100);
  });
});

describe("track imbalance", () => {
  const now = Date.parse("2026-08-29T00:00:00Z");
  const progress = (...entries: Array<[Track, number]>) => entries.map(([track, known]) => ({ track, known }));

  it("enforces the leader floor and ratio boundaries", () => {
    expect(trackImbalance(progress(["kr", 19], ["jp", 9]), {}, now)).toBeUndefined();
    expect(trackImbalance(progress(["kr", 20], ["jp", 10]), {}, now)).toBe("jp");
    expect(trackImbalance(progress(["kr", 20], ["jp", 11]), {}, now)).toBeUndefined();
  });

  it("never nudges one enabled track", () => {
    expect(trackImbalance(progress(["kr", 100]), {}, now)).toBeUndefined();
  });

  it("chooses the lowest lagging track and breaks ties in TRACKS order", () => {
    expect(trackImbalance(progress(["kr", 30], ["jp", 12], ["cn", 5]), {}, now)).toBe("cn");
    expect(trackImbalance(progress(["cn", 5], ["jp", 5], ["kr", 30]), {}, now)).toBe("jp");
  });

  it("honors 7-day and 14-day snoozes against an injected clock", () => {
    const tracks = progress(["kr", 20], ["cn", 10]);
    const day = 86_400_000;
    expect(trackImbalance(tracks, { cn: now + 7 * day }, now + 7 * day - 1)).toBeUndefined();
    expect(trackImbalance(tracks, { cn: now + 7 * day }, now + 7 * day)).toBe("cn");
    expect(trackImbalance(tracks, { cn: now + 14 * day }, now + 14 * day - 1)).toBeUndefined();
    expect(trackImbalance(tracks, { cn: now + 14 * day }, now + 14 * day)).toBe("cn");
  });
});

describe("lesson track scope", () => {
  it("uses an enabled request and falls back for absent, malformed, or disabled state", () => {
    expect(lessonTracks("cn", ["kr", "cn"])).toEqual(["cn"]);
    expect(lessonTracks(["cn"], ["kr", "cn"])).toEqual(["cn"]);
    expect(lessonTracks(undefined, ["kr", "cn"])).toEqual(["kr", "cn"]);
    expect(lessonTracks("invalid" as Track, ["kr", "cn"])).toEqual(["kr", "cn"]);
    expect(lessonTracks("jp", ["kr", "cn"])).toEqual(["kr", "cn"]);
    expect(lessonTracks(["jp"], ["kr", "cn"])).toEqual(["kr", "cn"]);
  });

  it("accepts bounded session limits and falls back to the lesson size", () => {
    expect(lessonLimit(10)).toBe(10);
    expect(lessonLimit(20)).toBe(20);
    expect([undefined, 0, 51, 1.5, Number.NaN].map(lessonLimit)).toEqual([8, 8, 8, 8, 8]);
  });
});

describe("previous-unit review", () => {
  it("includes placement-skipped and completed units, never a current partial unit", () => {
    const unit = (id: number, current: boolean, done: boolean) => ({ id, level: "8급", levelOrd: id, ord: 1, title: "", subtitle: "", progress: { known: 0, total: 1 }, current, nodes: [{ key: String(id), glyph: String(id), reading: "", state: done ? "done" : "locked" as const }] });
    expect(reviewableUnits([unit(1, false, false), unit(2, true, false), unit(3, false, false), unit(4, false, true)]).map((item) => item.id)).toEqual([1, 4]);
  });

  it("offers only levels whose every unit is reviewable", () => {
    const unit = (id: number, levelOrd: number, current: boolean, done: boolean) => ({ id, level: `L${levelOrd}`, levelOrd, ord: id, title: "", subtitle: "", progress: { known: 0, total: 1 }, current, nodes: [{ key: String(id), glyph: String(id), reading: "", state: done ? "done" : "locked" as const }] });
    const units = [unit(1, 1, false, false), unit(2, 1, false, false), unit(3, 2, true, false), unit(4, 2, false, false), unit(5, 3, false, true)];

    expect(reviewableLevels(units)).toEqual([{ level: "L1", levelOrd: 1 }, { level: "L3", levelOrd: 3 }]);
  });

  it("disambiguates duplicate Korean unit labels by canonical level order", () => {
    const unit = (id: number, levelOrd: number, level: string) => ({ id, level, levelOrd, ord: id, title: "", subtitle: "", progress: { known: 1, total: 1 }, current: false, nodes: [{ key: String(id), glyph: String(id), reading: "", state: "done" as const }] });

    expect(reviewLevelOptions([unit(1, 2, "7급"), unit(2, 2, "7급"), unit(3, 3, "7급"), unit(4, 3, "7급")])).toEqual([
      { label: "7급II", levelOrd: 2 },
      { label: "7급", levelOrd: 3 },
    ]);
  });
});
