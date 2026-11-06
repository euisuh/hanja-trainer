export type RecognitionResult = { status: "ok"; transcript: string } | { status: "denied" | "error" };

type RecognitionAlternative = { transcript: string };
type RecognitionEvent = { results: ArrayLike<ArrayLike<RecognitionAlternative>> };
type Recognizer = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognizerConstructor = new () => Recognizer;

type RecognitionWindow = Window & { SpeechRecognition?: RecognizerConstructor; webkitSpeechRecognition?: RecognizerConstructor };

function constructor(): RecognizerConstructor | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Browser API capability probe.
  if (typeof window === "undefined") return undefined;
  // SAFETY: The standard and webkit-prefixed constructors are optional Window members missing from lib.dom.
  const scope = window as RecognitionWindow;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function recognitionSupported(): boolean {
  return constructor() !== undefined;
}

export type ActiveRecognition = { stop: () => void; abort: () => void };

// On-device/browser recognition: no backend, nothing stored. Returns null where the API is missing (Firefox, some WebViews).
// onDone fires once, with the transcript or a quiet failure; never throws.
export function startRecognition(lang: string, onDone: (result: RecognitionResult) => void): ActiveRecognition | null {
  const Constructor = constructor();
  if (!Constructor) return null;
  let recognizer: Recognizer;
  try { recognizer = new Constructor(); } catch { return null; }
  let transcript = "";
  let failure: "denied" | "error" | null = null;
  let finished = false;
  const finish = (result: RecognitionResult) => { if (!finished) { finished = true; onDone(result); } };
  recognizer.lang = lang;
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  recognizer.onresult = (event) => {
    transcript = Array.from(event.results, (result) => result[0]?.transcript ?? "").join("");
  };
  recognizer.onerror = (event) => {
    // "no-speech" and "aborted" mean nothing was heard: an empty transcript, not a failure.
    if (event.error === "not-allowed" || event.error === "service-not-allowed") failure = "denied";
    else if (event.error !== "no-speech" && event.error !== "aborted") failure = "error";
  };
  recognizer.onend = () => finish(failure ? { status: failure } : { status: "ok", transcript });
  try { recognizer.start(); } catch { return null; }
  return {
    stop: () => { try { recognizer.stop(); } catch { finish({ status: "error" }); } },
    abort: () => { finished = true; recognizer.onend = null; try { recognizer.abort(); } catch { /* Already stopped. */ } },
  };
}
