import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CharacterEntry } from "../../shared/types";
import { QuizCard } from "./QuizCard";

const character: CharacterEntry = {
  id: 1, key: "學", meaningEn: "study", meaningKo: "배우다", variants: {}, strokeCount: 16, createdAt: 0,
  tracks: [{ characterId: 1, glyph: "學", levelOrd: 1, track: "kr", reading: "학", level: "8급" }],
  sentences: [{ id: 1, characterId: 1, track: "kr", text: "學校", reading: "학교", translationKo: "학교", source: "test", sourceKind: "corpus", targetIndex: 0, rank: 1 }],
};

describe("recall card context", () => {
  it("omits sentence answers until reveal without changing regular cards", () => {
    const render = (answerRevealed?: boolean) => renderToStaticMarkup(
      <QuizCard answerRevealed={answerRevealed} answered={false} character={character} compare={false} correct={false} kind="reading" onyomiScript="katakana" track="kr" />,
    );

    expect(render(false)).not.toContain("學校");
    expect(render(false)).not.toContain("학교");
    expect(render(true)).toContain("quiz-card__sentence");
    expect(render(true)).toContain("학교");
    expect(render()).toContain("quiz-card__sentence");
  });
});
