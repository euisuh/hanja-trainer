import type { CSSProperties } from "react";
import type { ReviewLogEntry, ReviewState } from "../../shared/fsrs";
import { buildIntervalBars } from "./detailModel";

export function IntervalChart({ accent, logs, state }: { accent: string; logs: ReviewLogEntry[]; state?: ReviewState }) {
  const bars = buildIntervalBars(logs);
  return (
    <section className="interval-chart" style={{ "--detail-accent": accent } as CSSProperties}>
      <header><strong>복습 간격 성장</strong><span>안정도 {state ? state.stability.toFixed(1) : "—"}</span></header>
      {bars.length === 0 ? <p className="detail-empty">아직 복습 간격 기록이 없습니다.</p> : (
        <div className="interval-chart__bars">
          {bars.map((bar, index) => (
            <div className="interval-chart__bar" key={`${bar.days}:${index}`}><span style={{ height: `${bar.height}px` }} /><small>+{bar.days}d</small></div>
          ))}
        </div>
      )}
    </section>
  );
}
