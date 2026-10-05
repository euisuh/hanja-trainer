import { describe, expect, it, vi } from "vitest";
import { joinSpokenReadings } from "../../../shared/spokenReading";
import { cachedAudioUrl, LocalRecorder, MAX_RECORDING_MS, matchingVoice, measureOnset, recordingMimeType, sentenceAudioUrl, speechLanguages, type LocalRecordingState } from "./speech";

class FakeRecorder {
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;

  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    // SAFETY: The recorder callback only reads BlobEvent.data in this test.
    this.ondataavailable?.({ data: new Blob(["voice"]) } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

function asMediaRecorder(recorder: FakeRecorder): MediaRecorder {
  // SAFETY: FakeRecorder supplies every member LocalRecorder reads in these unit tests.
  return recorder as MediaRecorder;
}

function stream(stops: { count: number }): MediaStream {
  // SAFETY: Tests exercise only MediaStream.getTracks and each fake track's stop method.
  return { getTracks: () => [{ stop: () => { stops.count += 1; } }] } as MediaStream;
}

describe("study speech voices", () => {
  it("omits missing Japanese readings from generated and fallback speech", () => {
    expect(joinSpokenReadings("デン", "なし")).toBe("デン");
    expect(joinSpokenReadings("なし", "こ-む")).toBe("こ-む");
  });

  it("uses only the requested locale and normalizes underscores", () => {
    const voices = [{ lang: "zh-TW" }, { lang: "ja_JP" }, { lang: "ko-KR" }];
    expect(matchingVoice(voices, "jp")).toBe(voices[1]);
    expect(matchingVoice(voices, "kr")).toBe(voices[2]);
    expect(matchingVoice(voices, "cn")).toBeUndefined();
    expect(speechLanguages.cn).toBe("zh-CN");
  });

  it("prefers a remote locale voice and encodes cached character keys", () => {
    const voices = [
      { lang: "ko-KR", localService: true },
      { lang: "ko_KR", localService: false },
    ];
    expect(matchingVoice(voices, "kr")).toBe(voices[1]);
    expect(cachedAudioUrl("cn", "愛")).toBe("/api/audio/cn/%E6%84%9B.mp3");
  });

  it("derives sentence audio keys from Tatoeba sources only", () => {
    expect(sentenceAudioUrl("jp", "Tatoeba #380195")).toBe("/api/audio/jp/s380195.mp3");
    expect(sentenceAudioUrl("cn", "Tatoeba #1")).toBe("/api/audio/cn/s1.mp3");
    expect(sentenceAudioUrl("jp", "한국어문회")).toBeNull();
    expect(sentenceAudioUrl("jp", "Tatoeba #abc")).toBeNull();
  });

  it("prefers mp4, then webm opus, then webm recording formats", () => {
    expect(recordingMimeType((type) => type !== "audio/mp4")).toBe("audio/webm;codecs=opus");
    expect(recordingMimeType((type) => type === "audio/webm")).toBe("audio/webm");
    expect(recordingMimeType(() => false)).toBeUndefined();
  });

  it("measures onset from a synthetic silence-then-tone buffer", async () => {
    const frames = [new Float32Array(2048), Float32Array.from({ length: 2048 }, () => 0.05)];
    class FakeAnalyser {
      fftSize = 0;
      getFloatTimeDomainData(target: Float32Array) { target.set(frames.shift() ?? new Float32Array(target.length)); }
      disconnect() {}
    }
    class FakeAudioContext {
      createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; }
      createAnalyser() { return new FakeAnalyser(); }
      close() { return Promise.resolve(); }
    }
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { queueMicrotask(() => callback(0)); return 1; });
    try {
      expect(await measureOnset(stream({ count: 0 }))).toBeTypeOf("number");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("records for at most 15 seconds and revokes replaced or discarded clips", async () => {
    const states: LocalRecordingState[] = [];
    const stops = { count: 0 };
    const revoked: string[] = [];
    const timers: Array<{ callback: () => void; delay: number }> = [];
    let urls = 0;
    const recorder = new LocalRecorder((state) => states.push(state), {
      getUserMedia: async () => stream(stops),
      createRecorder: () => asMediaRecorder(new FakeRecorder()),
      createObjectURL: () => `blob:clip-${urls += 1}`,
      revokeObjectURL: (url) => revoked.push(url),
      setTimer: (callback, delay) => {
        timers.push({ callback, delay });
        // SAFETY: Timer handles remain opaque; this fake only needs a stable handle.
        return timers.length as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    });

    await recorder.record();
    expect(recorder.currentState.status).toBe("recording");
    expect(timers[0].delay).toBe(MAX_RECORDING_MS);
    timers[0].callback();
    expect(recorder.currentState).toMatchObject({ status: "ready", url: "blob:clip-1", mimeType: "audio/webm" });
    expect(stops.count).toBe(1);

    await recorder.record();
    expect(revoked).toEqual(["blob:clip-1"]);
    recorder.stop();
    expect(recorder.currentState).toMatchObject({ status: "ready", url: "blob:clip-2", mimeType: "audio/webm" });
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
      createRecorder: () => asMediaRecorder(new FakeRecorder()),
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
      createRecorder: () => asMediaRecorder(new FakeRecorder()),
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

  it("discards interrupted, empty, and silent recordings", async () => {
    const stops = { count: 0 };
    const interrupted = new LocalRecorder(() => undefined, {
      getUserMedia: async () => stream(stops),
      createRecorder: () => asMediaRecorder(new FakeRecorder()),
      createObjectURL: () => "blob:unused",
    });
    await interrupted.record();
    interrupted.interrupt();
    expect(interrupted.currentState.status).toBe("interrupted");
    expect(stops.count).toBe(1);

    class EmptyRecorder extends FakeRecorder {
      stop() { this.state = "inactive"; this.onstop?.(new Event("stop")); }
    }
    const empty = new LocalRecorder(() => undefined, {
      getUserMedia: async () => stream({ count: 0 }),
      createRecorder: () => asMediaRecorder(new EmptyRecorder()),
      createObjectURL: () => "blob:unused",
    });
    await empty.record();
    empty.stop();
    expect(empty.currentState.status).toBe("no_audio");

    class SilentAnalyser {
      fftSize = 0;
      getFloatTimeDomainData(target: Float32Array) { target.fill(0); }
      disconnect() {}
    }
    class SilentAudioContext {
      createMediaStreamSource() { return { connect: () => undefined, disconnect: () => undefined }; }
      createAnalyser() { return new SilentAnalyser(); }
      close() { return Promise.resolve(); }
    }
    vi.stubGlobal("window", { AudioContext: SilentAudioContext });
    vi.stubGlobal("requestAnimationFrame", () => 1);
    try {
      const silent = new LocalRecorder(() => undefined, {
        getUserMedia: async () => stream({ count: 0 }),
        createRecorder: () => asMediaRecorder(new FakeRecorder()),
        createObjectURL: () => "blob:unused",
      });
      await silent.record();
      silent.stop();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(silent.currentState.status).toBe("no_audio");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
