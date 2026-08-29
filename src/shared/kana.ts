export function toHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/gu, (character) => String.fromCodePoint(character.codePointAt(0)! - 0x60));
}
