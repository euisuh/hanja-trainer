import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TalkDiaryCalendar } from "./TalkDiaryCalendar";

describe("TalkDiaryCalendar", () => {
  it("marks speaking days with one pencil dot and keeps weekly copy plain", () => {
    const markup = renderToStaticMarkup(TalkDiaryCalendar({ calendar: [{ date: "2026-10-05", count: 2 }, { date: "2026-10-06", count: 0 }], spokenDaysThisWeek: 1, checkinsThisWeek: 1 }));
    expect(markup).toContain("talk-diary-calendar__day--spoken");
    expect(markup.match(/talk-diary-calendar__day--spoken/g)).toHaveLength(1);
    expect(markup).toContain("1 days spoken this week");
    expect(markup).toContain("실제로 해봤다 1회");
    expect(markup).not.toContain("연속");
  });
});
