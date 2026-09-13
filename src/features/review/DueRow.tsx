import type { CSSProperties, KeyboardEvent, Ref } from "react";
import { toHiragana } from "../../../shared/kana";
import type { OnyomiScript } from "../../../shared/settings";
import { readingFor } from "../../../shared/buildQueue";
import { trackThemes } from "../tracks/trackTheme";
import type { DueItem } from "./DueList";

type Props = {
  item: DueItem;
  buttonRef: Ref<HTMLButtonElement>;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
  onyomiScript: OnyomiScript;
};

export function DueRow({ item, buttonRef, onKeyDown, onOpen, onyomiScript }: Props) {
  const canonical = readingFor(item.trackEntry).label;
  const reading = item.trackEntry.track === "jp" && onyomiScript === "hiragana" ? toHiragana(canonical) : canonical;
  const theme = trackThemes[item.trackEntry.track];
  const style = { "--due-font": theme.font } as CSSProperties;
  return (
    <button className="due-row" onClick={onOpen} onKeyDown={onKeyDown} ref={buttonRef} style={style} type="button">
      <span className="due-row__glyph" lang={theme.lang}>{item.trackEntry.glyph}</span>
      <span className="due-row__copy">
        <strong lang={theme.lang}>{reading}</strong>
        <small className={`due-row__due${item.due.overdue ? " due-row__due--overdue" : ""}`}>{item.due.label}</small>
      </span>
      <span className="due-row__memory">S {item.state.stability.toFixed(1)}</span>
    </button>
  );
}
