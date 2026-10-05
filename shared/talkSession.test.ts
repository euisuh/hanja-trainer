import { describe, expect, it } from "vitest";
import { composeTalkSession, MAX_TALK_NEW_CHUNK_LIMIT, type TalkSessionInput } from "./talkSession";

type Chunk = { id: number; unitId: number; role: "hear" | "say" };
type Scene = { id: number; unitId: number };

const hear = (id: number, unitId = 1): Chunk => ({ id, unitId, role: "hear" });
const say = (id: number, unitId = 1): Chunk => ({ id, unitId, role: "say" });
const scene = (id: number, unitId = 1): Scene => ({ id, unitId });

function session(input: Partial<TalkSessionInput<Chunk, Scene>> = {}) {
  return composeTalkSession({ dueChunks: [], newChunks: [], practiceScene: scene(1), completedUnits: [], ...input });
}

describe("composeTalkSession", () => {
  it.each([
    {
      name: "orders due hear, due say, capped new chunks, then practice scene",
      input: { dueChunks: [say(2), hear(1)], newChunks: [say(3), say(4), say(5)], newChunkLimit: 2 },
      expected: ["hear:1", "say:2", "new:3", "new:4", "scene:1:practice"],
    },
    {
      name: "uses the default eight new chunks",
      input: { newChunks: Array.from({ length: 9 }, (_, index) => say(index + 1)) },
      expected: ["new:1", "new:2", "new:3", "new:4", "new:5", "new:6", "new:7", "new:8", "scene:1:practice"],
    },
    {
      name: "never exceeds the hard new-chunk cap",
      input: { newChunks: Array.from({ length: 11 }, (_, index) => say(index + 1)), newChunkLimit: 99 },
      expected: [...Array.from({ length: MAX_TALK_NEW_CHUNK_LIMIT }, (_, index) => `new:${index + 1}`), "scene:1:practice"],
    },
    {
      name: "does not repeat a due chunk as new",
      input: { dueChunks: [say(1)], newChunks: [say(1), say(2)] },
      expected: ["say:1", "new:2", "scene:1:practice"],
    },
  ])("$name", ({ input, expected }) => {
    expect(session(input).map((item) => item.kind === "chunk" ? `${item.phase}:${item.chunk.id}` : `scene:${item.scene.id}:${item.review ? "review" : "practice"}`)).toEqual(expected);
  });

  it.each([
    { dueChunks: [say(1), say(2), say(3)], review: true },
    { dueChunks: [say(1), say(2)], review: false },
    { dueChunks: [say(1), say(1), say(2)], review: false },
  ])("reviews a completed unit only when at least 30% of its chunks are due", ({ dueChunks, review }) => {
    const items = session({ dueChunks, completedUnits: [{ chunks: [say(1), say(2), say(3), say(4), say(5), say(6), say(7), say(8), say(9), say(10)], scene: scene(2, 1) }] });
    expect(items.at(-1)).toEqual({ kind: "scene", scene: review ? scene(2, 1) : scene(1), review });
  });

  it("uses the first qualifying completed unit", () => {
    const items = session({
      dueChunks: [say(1), say(2), say(3), say(11), say(12), say(13)],
      completedUnits: [
        { chunks: Array.from({ length: 10 }, (_, index) => say(index + 1)), scene: scene(2, 1) },
        { chunks: Array.from({ length: 10 }, (_, index) => say(index + 11, 2)), scene: scene(3, 2) },
      ],
    });
    expect(items.at(-1)).toEqual({ kind: "scene", scene: scene(2, 1), review: true });
  });
});
