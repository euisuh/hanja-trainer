import { afterEach, expect, it, vi } from "vitest";
import { PROFILE_EXPECTATION_HEADER, type SubmitReviewRequest } from "../shared/api";
import { apiClient, setApiProfileId } from "./apiClient";

afterEach(() => {
  setApiProfileId(null);
  vi.restoreAllMocks();
});

it("captures the initiating profile and honors an explicit review owner", async () => {
  const headers: Array<string | null> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    headers.push(new Headers(init?.headers).get(PROFILE_EXPECTATION_HEADER));
    return Response.json({ results: [] });
  });
  const review: SubmitReviewRequest = { sessionId: "owner", cardIndex: 0, characterKey: "一", track: "kr", correct: true, skipped: false, elapsedMs: 1, mode: "review" };

  setApiProfileId(1);
  const settings = apiClient.settings();
  setApiProfileId(2);
  await settings;
  await apiClient.submitReviews(1, [review]);
  await apiClient.profile(undefined, false, null);

  expect(headers).toEqual(["1", "1", null]);
});
