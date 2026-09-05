export function HighlightedSentence({ glyph, targetIndex, text }: { glyph: string; targetIndex: number | null; text: string }) {
  if (targetIndex === null) return <><span className="sentence-target">한자 {glyph}</span>{text}</>;
  const points = Array.from(text);
  return <>{points.slice(0, targetIndex).join("")}<mark>{points[targetIndex]}</mark>{points.slice(targetIndex + 1).join("")}</>;
}
