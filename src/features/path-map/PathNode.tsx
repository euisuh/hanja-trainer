import type { PathNodeModel } from "./homeModel";

type Props = {
  focused: boolean;
  node: PathNodeModel;
  onFocus: () => void;
  onOpen: () => void;
};

export function PathNode({ focused, node, onFocus, onOpen }: Props) {
  const locked = node.state === "locked";
  return (
    <div className="path-node-wrap">
      <button
        aria-label={`${node.glyph} ${node.label}`}
        className={`path-node path-node--${node.state}${focused ? " path-node--focused" : ""}`}
        disabled={locked}
        onClick={onOpen}
        onFocus={onFocus}
        type="button"
      >
        <span className="path-node__glyph">{node.glyph}</span>
        <span className="path-node__label">{node.label}</span>
      </button>
    </div>
  );
}
