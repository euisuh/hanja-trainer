// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationChunkPayload } from "../../../shared/api";
import { ListenCard } from "./ListenCard";
import { usePlaybackSpeed } from "./usePlaybackSpeed";

const card: ConversationChunkPayload = {
  id: 1, unitId: 1, ord: 1, ja: "はい", kana: "はい", koCue: "네", role: "hear", register: "polite",
  sourceKind: "authored", sourceRef: "test", audioKey: "test", audioUrl: "/audio/test.mp3",
};
const playedRates: number[] = [];
class FakeAudio {
  playbackRate = 1;
  pause() { /* No audio device in unit tests. */ }
  play() { playedRates.push(this.playbackRate); return Promise.resolve(); }
}
function Listening() {
  const playback = usePlaybackSpeed();
  return <ListenCard {...playback} card={card} choices={[card]} onNext={() => undefined} />;
}
let host: HTMLElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Audio", FakeAudio);
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
  playedRates.length = 0;
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

describe("listening speed persistence", () => {
  it("defaults to 1x, cycles all rates, remembers the last choice", async () => {
    await act(async () => { root.render(<Listening />); });
    expect(playedRates).toEqual([1]);
    for (const speed of [1.25, 0.75, 1]) {
      await act(async () => { host.querySelector<HTMLButtonElement>(".talk-speed")!.click(); });
      expect(host.querySelector(".talk-speed")?.textContent).toBe(`${speed}x`);
      expect(playedRates.at(-1)).toBe(speed);
      expect(localStorage.getItem("hanja-trainer:talk-speed")).toBe(String(speed));
    }
    await act(async () => { host.querySelector<HTMLButtonElement>(".talk-speed")!.click(); });
    await act(async () => { root.render(null); });
    await act(async () => { root.render(<Listening />); });
    expect(playedRates.at(-1)).toBe(1.25);
  });
  it("falls back to 1x for an unsupported stored rate", async () => {
    localStorage.setItem("hanja-trainer:talk-speed", "2");
    await act(async () => { root.render(<Listening />); });
    expect(playedRates).toEqual([1]);
  });
});
