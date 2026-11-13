import type { CharacterBuild, LevelChoices, PlayState } from "../../character/types.ts";
import type { ActionCost, Attribute, Price } from "../../rules/types.ts";
import type { Sheet } from "../../engine/compute.ts";
import { RULES_VERSION } from "./rules.tsx";

export const emptyLevel = (): LevelChoices => ({ feats: [], skillRanks: {}, saveProficiency: {} });

export const newBuild = (): CharacterBuild => ({
  schemaVersion: 1, rulesVersion: RULES_VERSION, name: "",
  baseAttributes: { STR: 10, CON: 10, DEX: 10, INT: 10, WIS: 10, CHA: 10 }, attributeMethod: "standardArray",
  ancestry: "", ancestryChoices: {}, background: "", backgroundSlots: {}, levels: [emptyLevel()],
});

export const initialPlay = (sheet: Sheet): PlayState => ({
  currentBP: sheet.bp.total, currentMP: sheet.mp.total - sheet.mpBoundByAttunement, wounds: 0, conditions: [],
  fatePoints: 0, xp: 1000, money: { gp: 0, sp: 0, bp: 0, cp: 0 },
});

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export const ATTRIBUTE_NAMES: Record<Attribute, string> = {
  STR: "Strength", CON: "Constitution", DEX: "Dexterity", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma",
};

export function actionLabel(a: ActionCost | null): string {
  if (!a) return "";
  if (a.kind === "free") return "⊙ free";
  if (a.kind === "reaction") return "↶ reaction";
  return "●".repeat(a.count);
}

export const priceLabel = (p: Price | null) => (p ? `${p.amount} ${p.currency}` : "—");

/** Fjerner "x." fra et ID til et kort navn, når entiteten ikke kan slås op. */
export const idLabel = (id: string) => id.split(".").pop()!.replace(/-/g, " ");
