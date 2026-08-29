import { toHiragana } from "../../shared/kana";
import type { OnyomiScript } from "../../shared/settings";
import type { CharacterEntry, TrackEntry } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";

function reading(entry: TrackEntry, onyomiScript: OnyomiScript): string {
  if (entry.track === "kr") return entry.reading;
  if (entry.track === "jp") return `${onyomiScript === "hiragana" ? toHiragana(entry.on) : entry.on} · ${entry.kun}`;
  return entry.pinyin;
}

function level(entry: TrackEntry): string {
  if (entry.track === "kr") return `한자 ${entry.level}`;
  if (entry.track === "jp") return `漢検 ${entry.kanken} · ${entry.jlpt}`;
  return `${entry.hsk} · ${entry.tier}`;
}

const labels = { kr: "한국 · 훈음", jp: "日本 · 音/訓", cn: "中国 · 拼音" } as const;

export function CompareCard({ character, onyomiScript }: { character: CharacterEntry; onyomiScript: OnyomiScript }) {
  return (
    <div className="compare-card" aria-label="교차 트랙 비교">
      {character.tracks.map((entry) => (
        <section className={`compare-card__panel compare-card__panel--${entry.track}`} key={entry.track} lang={trackThemes[entry.track].lang}>
          <div>{labels[entry.track]}</div>
          <strong>{reading(entry, onyomiScript)}</strong>
          <small>{level(entry)}</small>
        </section>
      ))}
    </div>
  );
}
