/**
 * Karakterens datamodel – det, der gemmes i Supabase.
 *
 * Princip: vi gemmer spillerens VALG, aldrig beregnede tal. Alle værdier på arket
 * (BP, DFR, skill-bonusser …) beregnes af regelmotoren ud fra valgene + regeldata.
 * Derfor giver en ny regelversion automatisk et korrekt ark.
 */
import type { Attribute, Currency, Id, Modifier, Save } from "../rules/types.ts";

export interface CharacterBuild {
  schemaVersion: 1;
  /** Regelversionen karakteren sidst blev valideret mod, fx "2026-09-19". */
  rulesVersion: string;
  name: string;

  /** Attributscorer FØR ancestry og level-ups (standard array eller rullet). */
  baseAttributes: Record<Attribute, number>;
  attributeMethod: "standardArray" | "rolled";

  ancestry: Id;
  /** Valg knyttet til ancestry, fx Human: { attributeBoost: { STR: 2 } } */
  ancestryChoices: { attributeBoost?: Partial<Record<Attribute, number>> };

  background: Id;
  /** Udfyldning af background-slots: "Weapon #1" → skill-ID osv. */
  backgroundSlots: { weapon?: Id[]; armor?: Id[] };

  /** Ét element pr. hero level; levels[0] er level 1. Level = levels.length. */
  levels: LevelChoices[];

  /**
   * Kendte spells. "start" = valgt ved oprettelse (3 pr. study-tier),
   * "learned" = lært i spillet fra skriftruller, lærere osv. (ingen grænse).
   */
  spells?: { spell: Id; source: "start" | "learned" }[];
}

export interface FeatPick {
  feat: Id;
  /** Svar på feat'ens choices, fx { weapon: "weapon.longsword" }. */
  choices?: Record<string, Id | string>;
}

export interface LevelChoices {
  feats: FeatPick[];
  /** Ranks købt på dette level (højst 2 pr. skill). */
  skillRanks: Record<Id, 1 | 2>;
  /** Save proficiency-point fordelt på dette level. */
  saveProficiency: Partial<Record<Save, number>>;
  /** Level 5, 9, 13 …: +1 til to forskellige attributter. */
  attributeIncreases?: [Attribute, Attribute];
  /** Level 3, 7, 11 …: +5 til BP eller MP. */
  bpOrMp?: "BP" | "MP";
}

/** En genstand i inventory – enten fra kataloget (regeldata) eller oprettet af spilleren. */
export interface InventoryItem {
  /** Unikt pr. karakter. */
  instanceId: string;
  /** Katalog-reference (weapon.*, armor.*), eller udeladt for egne items. */
  ref?: Id;
  /** Spillerens egne items, fx magisk loot. Overskriver katalogværdier hvis begge findes. */
  custom?: {
    name: string;
    description?: string;
    enc?: number;
    /** Fx +1 magical DFR. Regnes med, når item'et er equipped (og attuned, hvis det kræves). */
    modifiers?: Modifier[];
    /** Attunement binder MP, så længe item'et er attuned. */
    attunementMp?: number;
  };
  quantity: number;
  /** Båret/brugt: rustning og skjold tæller i DFR, modifiers gælder. */
  equipped: boolean;
  attuned?: boolean;
  notes?: string;
}

/** Tilstanden under spillet – ændres hele tiden og gemmes separat fra build. */
export interface PlayState {
  currentBP: number;
  currentMP: number;
  wounds: number;
  conditions: { id: string; value?: number; note?: string }[];
  fatePoints: number;
  /** Spells, der er memoriseret lige nu (skiftes under hvil). */
  memorizedSpells?: Id[];
  xp: number;
  money: Record<Currency, number>;
}

export interface Character {
  id: string;
  build: CharacterBuild;
  inventory: InventoryItem[];
  play: PlayState;
}
