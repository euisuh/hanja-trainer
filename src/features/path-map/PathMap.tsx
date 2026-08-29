import type { PathNodeModel } from "./homeModel";
import type { OnyomiScript } from "../../shared/settings";
import type { Track } from "../../shared/types";
import { trackThemes } from "../tracks/trackTheme";
import { PathNode } from "./PathNode";

type Props = {
  nodes: PathNodeModel[];
  focusedIndex: number;
  unit: string;
  title: string;
  onyomiScript: OnyomiScript;
  track: Track;
  onFocus: (index: number) => void;
  onOpen: (node: PathNodeModel) => void;
};

export function PathMap({ nodes, focusedIndex, unit, title, onyomiScript, track, onFocus, onOpen }: Props) {
  const done = nodes.filter((node) => node.state === "done").length;
  const theme = trackThemes[track];
  return (
    <section className="path-map">
      <div className="path-map__heading">
        <span lang={theme.lang}>{unit}</span>
        <small>{done} / {nodes.length} 자</small>
      </div>
      <h2 lang={theme.lang}>{title}</h2>
      <div className="path-map__nodes">
        {nodes.map((node, index) => (
          <PathNode focused={focusedIndex === index} key={`${node.characterKey}:${node.glyph}`} node={node} onyomiScript={onyomiScript} onFocus={() => onFocus(index)} onOpen={() => onOpen(node)} track={track} />
        ))}
      </div>
      <p className="path-map__hint">↑ ↓ 이동 · Enter 열기</p>
    </section>
  );
}
