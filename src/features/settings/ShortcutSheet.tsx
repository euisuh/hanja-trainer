import { SHORTCUTS } from "../../shell/shortcuts";

export const shortcutRows = SHORTCUTS;

export function ShortcutSheet() {
  return (
    <section className="shortcut-sheet">
      <header>키보드 단축키</header>
      {shortcutRows.map((shortcut) => <div className="shortcut-sheet__row" key={shortcut.id}><kbd>{shortcut.keys}</kbd><span>{shortcut.description}</span></div>)}
    </section>
  );
}
