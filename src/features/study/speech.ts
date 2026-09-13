import { useEffect, useState } from "react";
import type { Track } from "../../../shared/types";
import { apiUrl } from "../../platform/apiUrl";

export const MAX_RECORDING_MS = 15_000;

export type LocalRecordingState =
  | { status: "idle" | "requesting" | "recording" | "unsupported" | "denied" | "error" }
  | { status: "ready"; url: string };

export function localRecordingSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function"
    && typeof MediaRecorder !== "undefined" && typeof URL.createObjectURL === "function";
}

type TimerId = ReturnType<typeof globalThis.setTimeout>;
type RecordingEnvironment = {
  getUserMedia?: (() => Promise<MediaStream>) | null;
  createRecorder?: ((stream: MediaStream) => MediaRecorder) | null;
  createObjectURL?: ((blob: Blob) => string) | null;
  revokeObjectURL?: (url: string) => void;
  setTimer?: (callback: () => void, delay: number) => TimerId;
  clearTimer?: (timer: TimerId) => void;
};

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

function permissionDenied(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  return name === "NotAllowedError" || name === "SecurityError";
}

export class LocalRecorder {
  private readonly getUserMedia: (() => Promise<MediaStream>) | null;
  private readonly createRecorder: ((stream: MediaStream) => MediaRecorder) | null;
  private readonly createObjectURL: ((blob: Blob) => string) | null;
  private readonly revokeObjectURL: (url: string) => void;
  private readonly setTimer: (callback: () => void, delay: number) => TimerId;
  private readonly clearTimer: (timer: TimerId) => void;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private timer: TimerId | null = null;
  private chunks: Blob[] = [];
  private url: string | null = null;
  private generation = 0;
  private disposed = false;
  private state: LocalRecordingState;

  constructor(private readonly onChange: (state: LocalRecordingState) => void, environment: RecordingEnvironment = {}) {
    const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    const Recorder = typeof MediaRecorder === "undefined" ? undefined : MediaRecorder;
    this.getUserMedia = environment.getUserMedia === undefined
      ? mediaDevices?.getUserMedia ? () => mediaDevices.getUserMedia({ audio: true }) : null
      : environment.getUserMedia;
    this.createRecorder = environment.createRecorder === undefined ? Recorder ? (stream) => new Recorder(stream) : null : environment.createRecorder;
    this.createObjectURL = environment.createObjectURL === undefined ? typeof URL.createObjectURL === "function" ? (blob) => URL.createObjectURL(blob) : null : environment.createObjectURL;
    this.revokeObjectURL = environment.revokeObjectURL ?? ((url) => URL.revokeObjectURL(url));
    this.setTimer = environment.setTimer ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.clearTimer = environment.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
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
  }

  private releaseClip() {
    if (this.url) this.revokeObjectURL(this.url);
    this.url = null;
  }

  private fail(generation: number, status: "denied" | "error") {
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
    try {
      const recorder = this.createRecorder!(stream);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => { if (generation === this.generation && event.data.size > 0) this.chunks.push(event.data); };
      recorder.onerror = () => this.fail(generation, "error");
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        this.recorder = null;
        if (this.timer !== null) this.clearTimer(this.timer);
        this.timer = null;
        stopTracks(this.stream);
        this.stream = null;
        const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
        this.chunks = [];
        if (blob.size === 0) { this.fail(generation, "error"); return; }
        try {
          this.url = this.createObjectURL!(blob);
          this.emit({ status: "ready", url: this.url });
        } catch {
          this.fail(generation, "error");
        }
      };
      recorder.start();
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
