import { expect, it } from "vitest";
import { talkSources } from "./AboutScreen";

it("lists only Talk sources used by shipped conversation JSON", () => {
  expect(talkSources.map((source) => source.name)).toEqual(["Tatoeba"]);
});
