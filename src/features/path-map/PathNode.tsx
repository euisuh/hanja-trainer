import { toHiragana } from "../../shared/kana";
import type { OnyomiScript } from "../../shared/settings";
import type { Track } from "../../shared/types";
import type { PathNodeModel } from "./homeModel";
import { trackThemes } from "../tracks/trackTheme";

type Props = {
  focused: boolean;
  next: boolean;
  node: PathNodeModel;
  onyomiScript: OnyomiScript;
  track: Track;
  onFocus: () => void;
  onOpen: () => void;
};

export function PathNode({ focused, next, node, onyomiScript, track, onFocus, onOpen }: Props) {
  const locked = node.state === "locked";
  const label = track === "jp" && onyomiScript === "hiragana" ? toHiragana(node.label) : node.label;
  const theme = trackThemes[track];
  return (
    <div className="path-node-wrap">
      <button
        className={`path-node path-node--${node.state}${focused ? " path-node--focused" : ""}${next ? " path-node--next" : ""}`}
        disabled={locked}
        onClick={onOpen}
        onFocus={onFocus}
        type="button"
      >
        <span className="path-node__glyph" lang={theme.lang}>{node.glyph}</span>
        {node.state === "done" && <span aria-hidden="true" className="path-node__check">✓</span>}
        <span className="path-node__label" lang={locked ? trackThemes.kr.lang : theme.lang}>{label}</span>
      </button>
    </div>
  );
}
