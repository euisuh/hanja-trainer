// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationTemplatePayload } from "../../../shared/api";
import { SlotDrillCard } from "./SlotDrillCard";

const template: ConversationTemplatePayload = {
  id: 1, key: "tpl-shadow-flow", unitId: 5, ord: 1, jaTemplate: "___をください。", kanaTemplate: "___をください。", cueKo: "{slot} 달라고 주문하기",
  register: "polite", patternChunkId: 9,
  slots: [{ ja: "コーヒー", kana: "コーヒー", meaningKo: "커피" }, { ja: "紅茶", kana: "こうちゃ", meaningKo: "홍차" }],
};

let spokenText = "";
class FakeRecorder {
  static isTypeSupported() { return true; }
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["x"]) }); this.onstop?.(); }
}
class FakeRecognition {
  lang = ""; interimResults = false; maxAlternatives = 1;
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() { /* waits for stop */ }
  stop() { this.onresult?.({ results: [[{ transcript: spokenText }]] }); this.onend?.(); }
  abort() { /* no result */ }
}

let host: HTMLElement;
let root: Root;
const tick = () => act(async () => { await Promise.resolve(); });
const press = async (label: string) => {
  const button = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
  expect(button, label).toBeDefined();
  await act(async () => { button!.click(); });
  await tick();
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const stream = { getTracks: () => [{ stop: vi.fn() }] };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => Promise.resolve(stream) } });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  URL.createObjectURL = () => "blob:clip";
  URL.revokeObjectURL = () => undefined;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

async function openShadow(onRate: (grade: string) => void) {
  await act(async () => { root.render(<SlotDrillCard onRate={onRate} template={template} />); });
  await press("정답 공개");
  await press("따라 말하기");
  await press("녹음 시작");
  await press("녹음 중지");
}

describe("shadowing flow", () => {
  it("records, recognizes, preselects good, and reports only the confirmed rating", async () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const onRate = vi.fn();
    await act(async () => { root.render(<SlotDrillCard onRate={onRate} template={template} />); });
    await press("정답 공개");
    spokenText = host.querySelector("span[lang=ja]")!.textContent!;
    await press("따라 말하기");
    await press("녹음 시작");
    await press("녹음 중지");
    expect(host.querySelector("audio")).not.toBeNull();
    expect(host.querySelector(".talk-screen__diff-missing")).toBeNull();
    expect(host.textContent).toContain("비교 100%");
    const good = [...host.querySelectorAll("button")].find((button) => button.textContent === "좋아요")!;
    expect(good.getAttribute("aria-pressed")).toBe("true");
    expect(onRate).not.toHaveBeenCalled();
    await press("이 평가로 다음");
    expect(onRate).toHaveBeenCalledExactlyOnceWith("good");
  });

  it("suggests again for a wrong transcript and lets the learner override", async () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    spokenText = "ぜんぜんちがう";
    const onRate = vi.fn();
    await openShadow(onRate);
    expect(host.querySelector(".talk-screen__diff-missing")).not.toBeNull();
    const again = [...host.querySelectorAll("button")].find((button) => button.textContent === "다시")!;
    expect(again.getAttribute("aria-pressed")).toBe("true");
    await press("비슷해요");
    await press("이 평가로 다음");
    expect(onRate).toHaveBeenCalledExactlyOnceWith("hard");
  });

  it("degrades to self-grade when SpeechRecognition is missing", async () => {
    const onRate = vi.fn();
    await openShadow(onRate);
    expect(host.textContent).toContain("자동 비교를 쓸 수 없습니다");
    expect(host.querySelector("[role=alert]")).toBeNull();
    const confirm = [...host.querySelectorAll("button")].find((button) => button.textContent === "이 평가로 다음")!;
    expect(confirm.disabled).toBe(true);
    await press("좋아요");
    await press("이 평가로 다음");
    expect(onRate).toHaveBeenCalledExactlyOnceWith("good");
  });
});
