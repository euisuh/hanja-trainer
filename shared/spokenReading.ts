export function joinSpokenReadings(...values: Array<string | undefined>): string {
  return values.map((value) => value?.trim()).filter((value) => value && value !== "なし").join("、");
}
