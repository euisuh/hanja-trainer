import { toHiragana } from "./kana";

export type DiffOp = { type: "match" | "missing" | "extra"; text: string };
export type SpeechScore = { score: number; ops: DiffOp[]; target: string; spoken: string };

const PARTICLES = new Set(["は", "が", "を", "に", "で", "と", "も", "の", "へ", "か"]);

export function normalizeSpeech(value: string): string {
  return toHiragana(value.normalize("NFKC").toLowerCase()).replace(/[\p{P}\p{S}\p{Z}\s]/gu, "");
}

// Character-level LCS diff; target chars absent from the transcript are "missing", transcript-only chars are "extra".
export function diffChars(target: string, spoken: string): DiffOp[] {
  const a = [...target];
  const b = [...spoken];
  const table = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp["type"], text: string) => {
    const last = ops[ops.length - 1];
    if (last?.type === type) last.text += text; else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push("match", a[i]); i += 1; j += 1; }
    else if (j >= b.length || (i < a.length && table[i + 1][j] >= table[i][j + 1])) { push("missing", a[i]); i += 1; }
    else { push("extra", b[j]); j += 1; }
  }
  return ops;
}

function scoreAgainst(target: string, spoken: string): SpeechScore {
  const t = normalizeSpeech(target);
  const s = normalizeSpeech(spoken);
  const ops = diffChars(t, s);
  const matched = ops.filter((op) => op.type === "match").reduce((sum, op) => sum + [...op.text].length, 0);
  const total = [...t].length + [...s].length;
  return { score: total === 0 ? 0 : (2 * matched) / total, ops, target: t, spoken: s };
}

// The target may be written in kanji while recognition returns kana (or the reverse), so score both forms and keep the better.
export function scoreSpeech(spoken: string, targets: readonly string[]): SpeechScore {
  const results = targets.flatMap((target) => normalizeSpeech(target) === "" ? [] : [scoreAgainst(target, spoken)]);
  if (normalizeSpeech(spoken) === "" || results.length === 0) return { score: 0, ops: [], target: results[0]?.target ?? "", spoken: "" };
  return results.reduce((best, next) => (next.score > best.score ? next : best));
}

export type SuggestedGrade = "again" | "hard" | "good";

export function suggestGrade(score: number): SuggestedGrade {
  if (score >= 0.9) return "good";
  if (score >= 0.6) return "hard";
  return "again";
}

export function speechHints(result: SpeechScore): string[] {
  if (result.spoken === "") return ["소리가 인식되지 않았어요. 조금 더 또렷하게 다시 말해 보세요."];
  const missing = result.ops.filter((op) => op.type === "missing").flatMap((op) => [...op.text]);
  const extra = result.ops.filter((op) => op.type === "extra").map((op) => op.text);
  if (missing.length === 0 && extra.length === 0) return ["거의 똑같이 들렸어요."];
  const hints: string[] = [];
  const particles = missing.filter((char) => PARTICLES.has(char));
  if (particles.length > 0) hints.push(`조사 '${[...new Set(particles)].join("', '")}'가 빠졌어요. 작게 붙여 말해 보세요.`);
  const rest = missing.filter((char) => !PARTICLES.has(char));
  if (rest.length > 0) hints.push(`빠진 소리: ${rest.join(" ")}`);
  if (extra.length > 0) hints.push(`다르게 들린 소리: ${extra.join(" ")}`);
  return hints;
}
