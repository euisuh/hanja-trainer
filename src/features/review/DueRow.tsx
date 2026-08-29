import type { CSSProperties, KeyboardEvent, Ref } from "react";
import { tracks } from "../../design/tokens";
import { readingFor } from "../session/buildQueue";
import type { OnyomiScript } from "../../shared/settings";
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
  const style = { "--due-font": tracks[item.trackEntry.track].font } as CSSProperties;
  return (
    <button className="due-row" onClick={onOpen} onKeyDown={onKeyDown} ref={buttonRef} style={style} type="button">
      <span className="due-row__glyph">{item.trackEntry.glyph}</span>
      <span className="due-row__copy">
        <strong>{reading.label}</strong>
        <small className={item.due.overdue ? "due-row__overdue" : ""}>{item.due.label}</small>
      </span>
      <span className="due-row__stability">S {item.state.stability.toFixed(1)}</span>
    </button>
  );
}
