import kr4 from "../data/characters/kr-4geup.json";
import kr4ii from "../data/characters/kr-4geup2.json";
import kr5 from "../data/characters/kr-5geup.json";
import kr5ii from "../data/characters/kr-5geup2.json";
import kr6 from "../data/characters/kr-6geup.json";
import kr6ii from "../data/characters/kr-6geup2.json";
import kr7 from "../data/characters/kr-7geup.json";
import kr8 from "../data/characters/kr-8geup.json";

type HanjaBridgeRun = { text: string; reading: string | null };

const krCharacters = [kr8, kr7, kr6ii, kr6, kr5ii, kr5, kr4ii, kr4].flatMap(({ characters }) => characters);
const readings = new Map<string, string>();

for (const character of krCharacters) {
  const reading = character.tracks.find((track) => track.track === "kr")?.reading.split(/[,/]/u)[0].trim().split(/\s+/u).at(-1);
  if (!reading) continue;
  readings.set(character.key, reading);
  if (character.variants.jp) readings.set(character.variants.jp, reading);
}

export function hanjaBridge(text: string): HanjaBridgeRun[] {
  const runs: HanjaBridgeRun[] = [];
  for (const glyph of text) {
    const reading = readings.get(glyph) ?? null;
    const previous = runs.at(-1);
    if (previous && (reading === null) === (previous.reading === null)) {
      previous.text += glyph;
      if (reading !== null) previous.reading += reading;
    } else runs.push({ text: glyph, reading });
  }
  return runs;
}
