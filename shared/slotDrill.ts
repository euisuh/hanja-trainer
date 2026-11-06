// Slot-substitution drill: one template ("___をください。") plus 4-6 noun slots yields a say card.
// FSRS state is keyed per template, not per slot, so the pattern is scheduled once however many nouns rotate through it.
import type { ConversationRegister } from "./types";

export const SLOT_BLANK = "___";
export const SLOT_CUE_MARKER = "{slot}";

export interface SlotDrillSlot {
  ja: string;
  kana: string;
  meaningKo: string;
}

export interface SlotDrillTemplate {
  key: string;
  jaTemplate: string;
  kanaTemplate: string;
  cueKo: string;
  register: ConversationRegister;
  slots: readonly SlotDrillSlot[];
}

export interface SlotDrillCard {
  kind: "slot-drill";
  templateKey: string;
  stateKey: string;
  slotIndex: number;
  cueKo: string;
  ja: string;
  kana: string;
  options: readonly SlotDrillSlot[];
}

export function slotDrillStateKey(templateKey: string): string {
  return `tpl:${templateKey}`;
}

export function fillTemplate(template: string, value: string): string {
  return template.replace(SLOT_BLANK, value);
}

// `previousSlotIndex` keeps the same noun from coming up twice in a row.
export function buildSlotDrillCard(template: SlotDrillTemplate, random: () => number = Math.random, previousSlotIndex?: number): SlotDrillCard {
  const candidates = template.slots.map((_, index) => index).filter((index) => index !== previousSlotIndex);
  const slotIndex = candidates[Math.floor(random() * candidates.length)];
  const slot = template.slots[slotIndex];
  return {
    kind: "slot-drill",
    templateKey: template.key,
    stateKey: slotDrillStateKey(template.key),
    slotIndex,
    cueKo: template.cueKo.replace(SLOT_CUE_MARKER, slot.meaningKo),
    ja: fillTemplate(template.jaTemplate, slot.ja),
    kana: fillTemplate(template.kanaTemplate, slot.kana),
    options: template.slots,
  };
}
