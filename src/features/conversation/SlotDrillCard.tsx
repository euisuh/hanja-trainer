import { useMemo, useState } from "react";
import type { ConversationGrade, ConversationTemplatePayload } from "../../../shared/api";
import { buildSlotDrillCard } from "../../../shared/slotDrill";

// Last noun shown per template, so a template never repeats the same slot back to back.
const lastSlotByTemplate = new Map<string, number>();

type Props = { template: ConversationTemplatePayload; onRate: (grade: ConversationGrade) => void };

export function SlotDrillCard({ template, onRate }: Props) {
  const card = useMemo(() => {
    const next = buildSlotDrillCard(template, Math.random, lastSlotByTemplate.get(template.key));
    lastSlotByTemplate.set(template.key, next.slotIndex);
    return next;
  }, [template]);
  const [revealed, setRevealed] = useState(false);
  return <section className="talk-root talk-screen" data-talk-stage={revealed ? "reveal" : "cue"} data-talk-kind="slot-drill">
    <div className="talk-screen__page">
      <p className="talk-screen__cue">{card.cueKo}</p>
      <small>{template.jaTemplate} · {card.options.map((slot) => slot.ja).join(" / ")}</small>
      {revealed && <div className="talk-screen__answer"><strong lang="ja">{card.ja}</strong><span lang="ja">{card.kana}</span></div>}
    </div>
    <footer className="talk-screen__bar">
      {!revealed && <button onClick={() => setRevealed(true)} type="button">정답 공개</button>}
      {revealed && <div role="group" aria-label="자기 평가" className="talk-screen__ratings">
        <button onClick={() => onRate("again")} type="button">못함</button>
        <button onClick={() => onRate("hard")} type="button">막힘</button>
        <button onClick={() => onRate("good")} type="button">바로</button>
      </div>}
    </footer>
  </section>;
}
