import type { CSSProperties } from "react";
import { buildIntervalValues } from "./detailModel";

export function IntervalChart({ accent, intervals, stability }: { accent: string; intervals: number[]; stability?: number }) {
  const bars = buildIntervalValues(intervals);
  return (
    <section className="interval-chart" style={{ "--detail-accent": accent } as CSSProperties}>
      <header><strong>복습 간격 성장</strong><span>안정도 {stability === undefined ? "—" : stability.toFixed(1)}</span></header>
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
