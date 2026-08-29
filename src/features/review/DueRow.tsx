import type { CSSProperties, KeyboardEvent, Ref } from "react";
import type { OnyomiScript } from "../../shared/settings";
import { readingFor } from "../session/buildQueue";
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
  const reading = readingFor(item.trackEntry, onyomiScript);
  const theme = trackThemes[item.trackEntry.track];
  const style = { "--due-font": theme.font } as CSSProperties;
  return (
    <button className="due-row" onClick={onOpen} onKeyDown={onKeyDown} ref={buttonRef} style={style} type="button">
      <span className="due-row__glyph" lang={theme.lang}>{item.trackEntry.glyph}</span>
      <span className="due-row__copy">
        <strong lang={theme.lang}>{reading.label}</strong>
        <small className={item.due.overdue ? "due-row__overdue" : ""}>{item.due.label}</small>
      </span>
      <span className="due-row__stability">S {item.state.stability.toFixed(1)}</span>
    </button>
  );
}
