import { afterEach, describe, expect, it, vi } from "vitest";
import { buzz } from "../../platform/haptics";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("answer feedback", () => {
  it("creates WebAudio lazily and caps the rising combo pitch", async () => {
    const frequencies: number[] = [];
    const peaks: number[] = [];
    let contexts = 0;
    class FakeAudioContext {
      currentTime = 1;
      destination = {};
      state = "suspended";
      constructor() { contexts += 1; }
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime: (value: number) => frequencies.push(value) },
          connect<T>(target: T) { return target; },
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime: (value: number) => peaks.push(value), exponentialRampToValueAtTime() {} },
          connect<T>(target: T) { return target; },
        };
      }
      resume() { this.state = "running"; return Promise.resolve(); }
    }
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playCorrect, playSkip, playWrong } = await import("./feedbackSound");

    expect(contexts).toBe(0);
    playCorrect(1);
    expect(frequencies).toHaveLength(2);
    playCorrect(6);
    expect(frequencies).toHaveLength(5);
    playCorrect(99);
    playCorrect(8);
    expect(contexts).toBe(1);
    expect(frequencies[2]).toBeGreaterThan(frequencies[0]);
    expect(frequencies[5]).toBeCloseTo(frequencies[8]);
    playWrong();
    playSkip();
    expect(frequencies.slice(-3)).toEqual([174.61, 146.83, 220]);
    expect(peaks.slice(-3)).toEqual([0.10, 0.08, 0.06]);
  });

  it("vibrates when supported and ignores browser rejection", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    buzz([18, 40, 26]);
    expect(vibrate).toHaveBeenCalledWith([18, 40, 26]);
    vibrate.mockImplementation(() => { throw new Error("unfocused"); });
    expect(() => buzz(10)).not.toThrow();
  });

  it("ignores AudioContext construction failures", async () => {
    vi.stubGlobal("window", { AudioContext: class { constructor() { throw new Error("unavailable"); } } });
    const { playCorrect } = await import("./feedbackSound");

    expect(() => playCorrect(1)).not.toThrow();
  });
});
