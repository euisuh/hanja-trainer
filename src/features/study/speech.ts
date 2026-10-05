import { useEffect, useState } from "react";
import type { Track } from "../../../shared/types";
import { apiUrl } from "../../platform/apiUrl";

export const MAX_RECORDING_MS = 15_000;

export type LocalRecordingState =
  | { status: "idle" | "requesting" | "recording" | "unsupported" | "denied" | "error" | "no_audio" | "interrupted" }
  | { status: "ready"; url: string; mimeType: string; durationMs: number; onsetMs: number | null };

export function localRecordingSupported(): boolean {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Browser API capability probe.
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function"
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Browser API capability probe.
    && typeof MediaRecorder !== "undefined" && typeof URL.createObjectURL === "function";
}

type TimerId = ReturnType<typeof globalThis.setTimeout>;
type RecordingEnvironment = {
  getUserMedia?: (() => Promise<MediaStream>) | null;
  createRecorder?: ((stream: MediaStream, options?: MediaRecorderOptions) => MediaRecorder) | null;
  createObjectURL?: ((blob: Blob) => string) | null;
  revokeObjectURL?: (url: string) => void;
  setTimer?: (callback: () => void, delay: number) => TimerId;
  clearTimer?: (timer: TimerId) => void;
  now?: () => number;
};

const recordingMimeTypes = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
const ONSET_RMS_THRESHOLD = 0.02;

export function recordingMimeType(isSupported: (type: string) => boolean): string | undefined {
  return recordingMimeTypes.find((type) => isSupported(type));
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Browser rejection reason is untyped.
function permissionDenied(error: unknown): boolean {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- DOMException-like browser errors lack a shared type.
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  return name === "NotAllowedError" || name === "SecurityError";
}

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  // SAFETY: The optional legacy constructor is the only non-standard Window member read here.
  const legacyWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? legacyWindow.webkitAudioContext;
}

// undefined = onset could not be measured here (no AudioContext or a stream it cannot read); null = measured silence.
export function measureOnset(stream: MediaStream, signal?: AbortSignal): Promise<number | null | undefined> {
  const AudioContextConstructor = audioContextConstructor();
  if (!AudioContextConstructor) return Promise.resolve(undefined);
  let context: AudioContext;
  try {
    context = new AudioContextConstructor();
  } catch {
    return Promise.resolve(undefined);
  }
  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  try {
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
  } catch {
    void context.close().catch(() => undefined);
    return Promise.resolve(undefined);
  }
  analyser.fftSize = 2048;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const startedAt = performance.now();
  return new Promise((resolve) => {
    let cancelFrame: (() => void) | null = null;
    const finish = (onset: number | null) => {
      cancelFrame?.();
      signal?.removeEventListener("abort", onAbort);
      source.disconnect();
      analyser.disconnect();
      void context.close().catch(() => undefined);
      resolve(onset);
    };
    const onAbort = () => finish(null);
    const sample = () => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value ** 2, 0) / samples.length);
      if (rms >= ONSET_RMS_THRESHOLD) { finish(Math.max(0, performance.now() - startedAt)); return; }
      const requestFrame = globalThis.requestAnimationFrame;
      if (requestFrame !== undefined) {
        const frame = requestFrame(sample);
        cancelFrame = () => globalThis.cancelAnimationFrame?.(frame);
      } else {
        const timer = globalThis.setTimeout(sample, 16);
        cancelFrame = () => globalThis.clearTimeout(timer);
      }
    };
    if (signal?.aborted) { finish(null); return; }
    signal?.addEventListener("abort", onAbort, { once: true });
    sample();
  });
}

export class LocalRecorder {
  private readonly getUserMedia: (() => Promise<MediaStream>) | null;
  private readonly createRecorder: ((stream: MediaStream, options?: MediaRecorderOptions) => MediaRecorder) | null;
  private readonly createObjectURL: ((blob: Blob) => string) | null;
  private readonly revokeObjectURL: (url: string) => void;
  private readonly setTimer: (callback: () => void, delay: number) => TimerId;
  private readonly clearTimer: (timer: TimerId) => void;
  private readonly now: () => number;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private timer: TimerId | null = null;
  private chunks: Blob[] = [];
  private url: string | null = null;
  private generation = 0;
  private disposed = false;
  private state: LocalRecordingState;
  private startedAt: number | null = null;
  private onset: Promise<number | null | undefined> | null = null;
  private onsetAbort: AbortController | null = null;

  constructor(private readonly onChange: (state: LocalRecordingState) => void, environment: RecordingEnvironment = {}) {
    const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    const Recorder = typeof MediaRecorder === "undefined" ? undefined : MediaRecorder;
    this.getUserMedia = environment.getUserMedia === undefined
      ? mediaDevices?.getUserMedia ? () => mediaDevices.getUserMedia({ audio: true }) : null
      : environment.getUserMedia;
    this.createRecorder = environment.createRecorder === undefined ? Recorder ? (stream, options) => new Recorder(stream, options) : null : environment.createRecorder;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Browser API capability probe.
    this.createObjectURL = environment.createObjectURL === undefined ? typeof URL.createObjectURL === "function" ? (blob) => URL.createObjectURL(blob) : null : environment.createObjectURL;
    this.revokeObjectURL = environment.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
    this.setTimer = environment.setTimer ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.clearTimer = environment.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
    this.now = environment.now ?? (() => Date.now());
    this.state = this.supported ? { status: "idle" } : { status: "unsupported" };
  }

  get currentState(): LocalRecordingState { return this.state; }

  private get supported(): boolean { return Boolean(this.getUserMedia && this.createRecorder && this.createObjectURL); }

  private emit(state: LocalRecordingState) {
    if (this.disposed) return;
    this.state = state;
    this.onChange(state);
  }

  private clearCapture() {
    this.onsetAbort?.abort();
    this.onsetAbort = null;
    this.onset = null;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* Capture is already unusable; tracks still stop below. */ }
      }
    }
    stopTracks(this.stream);
    this.stream = null;
    this.chunks = [];
    this.startedAt = null;
  }

  private releaseClip() {
    if (this.url) this.revokeObjectURL(this.url);
    this.url = null;
  }

  private fail(generation: number, status: "denied" | "error" | "no_audio" | "interrupted") {
    if (generation !== this.generation) return;
    this.generation += 1;
    this.clearCapture();
    this.releaseClip();
    this.emit({ status });
  }

  async record() {
    const generation = this.generation += 1;
    this.clearCapture();
    this.releaseClip();
    if (!this.supported) { this.emit({ status: "unsupported" }); return; }
    this.emit({ status: "requesting" });
    let stream: MediaStream;
    try {
      stream = await this.getUserMedia!();
    } catch (error) {
      this.fail(generation, permissionDenied(error) ? "denied" : "error");
      return;
    }
    if (generation !== this.generation || this.disposed) { stopTracks(stream); return; }
    this.stream = stream;
    if (audioContextConstructor()) {
      this.onsetAbort = new AbortController();
      this.onset = measureOnset(stream, this.onsetAbort.signal);
    }
    try {
      const Recorder = globalThis.MediaRecorder;
      const mimeType = Recorder?.isTypeSupported ? recordingMimeType((type) => Recorder.isTypeSupported(type)) : undefined;
      const recorder = this.createRecorder!(stream, mimeType ? { mimeType } : undefined);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => { if (generation === this.generation && event.data.size > 0) this.chunks.push(event.data); };
      recorder.onerror = () => this.fail(generation, "error");
      const complete = (onset: number | null | undefined, measured: boolean) => {
        if (generation !== this.generation) return;
        this.onset = null;
        this.onsetAbort = null;
        this.recorder = null;
        if (this.timer !== null) this.clearTimer(this.timer);
        this.timer = null;
        stopTracks(this.stream);
        this.stream = null;
        const blob = new Blob(this.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        this.chunks = [];
        const durationMs = this.startedAt === null ? 0 : Math.max(0, this.now() - this.startedAt);
        this.startedAt = null;
        if (blob.size === 0 || measured && onset === null) { this.fail(generation, "no_audio"); return; }
        try {
          this.url = this.createObjectURL!(blob);
          this.emit({ status: "ready", url: this.url, mimeType: blob.type, durationMs, onsetMs: measured ? onset ?? null : null });
        } catch {
          this.fail(generation, "error");
        }
      };
      recorder.onstop = () => {
        const onset = this.onset;
        if (onset) { void onset.then((value) => complete(value, true)); return; }
        complete(null, false);
      };
      recorder.start();
      this.startedAt = this.now();
      this.timer = this.setTimer(() => this.stop(), MAX_RECORDING_MS);
      this.emit({ status: "recording" });
    } catch {
      this.fail(generation, "error");
    }
  }

  stop() {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    try {
      this.onsetAbort?.abort();
      recorder.stop();
      stopTracks(this.stream);
      this.stream = null;
    } catch {
      this.fail(this.generation, "error");
    }
  }

  discard() {
    this.generation += 1;
    this.clearCapture();
    this.releaseClip();
    this.emit(this.supported ? { status: "idle" } : { status: "unsupported" });
  }

  interrupt() {
    if (this.state.status !== "requesting" && this.state.status !== "recording") return;
    this.fail(this.generation, "interrupted");
  }

  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.clearCapture();
    this.releaseClip();
  }
}

export const speechLanguages: Record<Track, "ko-KR" | "ja-JP" | "zh-CN"> = {
  kr: "ko-KR",
  jp: "ja-JP",
  cn: "zh-CN",
};

export function matchingVoice<T extends { lang: string; localService?: boolean }>(voices: readonly T[], track: Track): T | undefined {
  const target = speechLanguages[track].toLowerCase();
  const matches = voices.filter((voice) => voice.lang.replace("_", "-").toLowerCase() === target);
  return matches.find((voice) => voice.localService === false) ?? matches[0];
}

export function cachedAudioUrl(track: Track, key: string): string {
  return apiUrl(`/api/audio/${track}/${encodeURIComponent(key)}.mp3`);
}

export function sentenceAudioUrl(track: Track, source: string): string | null {
  const id = /^Tatoeba #(\d+)$/u.exec(source)?.[1];
  return id ? apiUrl(`/api/audio/${track}/s${id}.mp3`) : null;
}

export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}
