import type { PathNodeModel } from "./homeModel";
import { PathNode } from "./PathNode";

type Props = {
  nodes: PathNodeModel[];
  focusedIndex: number;
  unit: string;
  title: string;
  onFocus: (index: number) => void;
  onOpen: (node: PathNodeModel) => void;
};

export function PathMap({ nodes, focusedIndex, unit, title, onFocus, onOpen }: Props) {
  const done = nodes.filter((node) => node.state === "done").length;
  return (
    <section className="path-map">
      <div className="path-map__heading">
        <span>{unit}</span>
        <small>{done} / {nodes.length} 자</small>
      </div>
      <h2>{title}</h2>
      <div className="path-map__nodes">
        {nodes.map((node, index) => (
          <PathNode focused={focusedIndex === index} key={`${node.characterKey}:${node.glyph}`} node={node} onFocus={() => onFocus(index)} onOpen={() => onOpen(node)} />
        ))}
      </div>
      <p className="path-map__hint">↑ ↓ 이동 · Enter 열기</p>
    </section>
  );
}
