import { useRef } from "react";
import { dueSort, formatDueLabel, isDue, type ReviewState } from "../../../shared/fsrs";
import type { CharacterEntry, Track, TrackEntry } from "../../../shared/types";
import type { OnyomiScript } from "../../../shared/settings";
import { reviewKey } from "../../../shared/buildQueue";
import { DueRow } from "./DueRow";

export const DUE_LIST_LIMIT = 50;

export type DueItem = {
  character: CharacterEntry;
  trackEntry: TrackEntry;
  state: ReviewState;
  due: ReturnType<typeof formatDueLabel>;
};

export function buildDueItems(characters: CharacterEntry[], states: ReadonlyMap<string, ReviewState>, enabledTracks: Track[], now = new Date()): DueItem[] {
  const enabled = new Set(enabledTracks);
  const dueItems = characters.flatMap((character) => character.tracks
    .filter((entry) => enabled.has(entry.track))
    .flatMap((trackEntry) => {
      const state = states.get(reviewKey(character.id, trackEntry.track));
      return state && isDue(state, now) ? [{ character, trackEntry, state, due: formatDueLabel(state, now) }] : [];
    }));
  const itemByState = new Map(dueItems.map((item) => [item.state, item]));
  return dueSort(dueItems.map((item) => item.state), now).map((state) => itemByState.get(state)!);
}

export function DueList({ items, onyomiScript, onOpen }: { items: DueItem[]; onyomiScript: OnyomiScript; onOpen: (item: DueItem) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = items.slice(0, DUE_LIST_LIMIT);
  function moveFocus(index: number, direction: number) {
    const next = (index + direction + visible.length) % visible.length;
    refs.current[next]?.focus();
  }
  return (
    <>
      <div className="due-list">
        {visible.map((item, index) => (
          <DueRow
            buttonRef={(node) => { refs.current[index] = node; }}
            item={item}
            key={`${item.character.id}:${item.trackEntry.track}`}
            onyomiScript={onyomiScript}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              moveFocus(index, event.key === "ArrowDown" ? 1 : -1);
            }}
            onOpen={() => onOpen(item)}
          />
        ))}
      </div>
      {items.length > visible.length && <p className="due-list__more">외 {items.length - visible.length}장</p>}
    </>
  );
}
