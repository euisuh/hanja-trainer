import { describe, expect, it } from "vitest";
import { LocalRecorder, MAX_RECORDING_MS, matchingVoice, speechLanguages, type LocalRecordingState } from "./speech";

class FakeRecorder {
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"]) } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

function stream(stops: { count: number }): MediaStream {
  return { getTracks: () => [{ stop: () => { stops.count += 1; } }] } as unknown as MediaStream;
}

describe("study speech voices", () => {
  it("uses only the requested locale and normalizes underscores", () => {
    const voices = [{ lang: "zh-TW" }, { lang: "ja_JP" }, { lang: "ko-KR" }];
    expect(matchingVoice(voices, "jp")).toBe(voices[1]);
    expect(matchingVoice(voices, "kr")).toBe(voices[2]);
    expect(matchingVoice(voices, "cn")).toBeUndefined();
    expect(speechLanguages.cn).toBe("zh-CN");
  });

  it("records for at most 15 seconds and revokes replaced or discarded clips", async () => {
    const states: LocalRecordingState[] = [];
    const stops = { count: 0 };
    const revoked: string[] = [];
    const timers: Array<{ callback: () => void; delay: number }> = [];
    let urls = 0;
    const recorder = new LocalRecorder((state) => states.push(state), {
      getUserMedia: async () => stream(stops),
      createRecorder: () => new FakeRecorder() as unknown as MediaRecorder,
      createObjectURL: () => `blob:clip-${urls += 1}`,
      revokeObjectURL: (url) => revoked.push(url),
      setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length as unknown as ReturnType<typeof setTimeout>; },
      clearTimer: () => undefined,
    });

    await recorder.record();
    expect(recorder.currentState.status).toBe("recording");
    expect(timers[0].delay).toBe(MAX_RECORDING_MS);
    timers[0].callback();
    expect(recorder.currentState).toEqual({ status: "ready", url: "blob:clip-1" });
    expect(stops.count).toBe(1);

    await recorder.record();
    expect(revoked).toEqual(["blob:clip-1"]);
    recorder.stop();
    expect(recorder.currentState).toEqual({ status: "ready", url: "blob:clip-2" });
    recorder.discard();
    expect(recorder.currentState).toEqual({ status: "idle" });
    expect(revoked).toEqual(["blob:clip-1", "blob:clip-2"]);
    expect(states.map((state) => state.status)).toContain("requesting");
  });

  it("reports unsupported and denied states without opening a recorder", async () => {
    const unsupported = new LocalRecorder(() => undefined, { getUserMedia: null, createRecorder: null, createObjectURL: null });
    expect(unsupported.currentState.status).toBe("unsupported");
    await unsupported.record();
    expect(unsupported.currentState.status).toBe("unsupported");

    const denied = new LocalRecorder(() => undefined, {
      getUserMedia: async () => { throw Object.assign(new Error("no"), { name: "NotAllowedError" }); },
      createRecorder: () => new FakeRecorder() as unknown as MediaRecorder,
      createObjectURL: () => "blob:unused",
    });
    await denied.record();
    expect(denied.currentState.status).toBe("denied");
  });

  it("stops late streams after navigation and cleans recorder errors", async () => {
    const lateStops = { count: 0 };
    let resolveStream!: (value: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => { resolveStream = resolve; });
    const waiting = new LocalRecorder(() => undefined, {
      getUserMedia: () => pending,
      createRecorder: () => new FakeRecorder() as unknown as MediaRecorder,
      createObjectURL: () => "blob:unused",
    });
    const request = waiting.record();
    waiting.dispose();
    resolveStream(stream(lateStops));
    await request;
    expect(lateStops.count).toBe(1);

    const errorStops = { count: 0 };
    const broken = new LocalRecorder(() => undefined, {
      getUserMedia: async () => stream(errorStops),
      createRecorder: () => { throw new Error("broken recorder"); },
      createObjectURL: () => "blob:unused",
    });
    await broken.record();
    expect(broken.currentState.status).toBe("error");
    expect(errorStops.count).toBe(1);
  });
});
