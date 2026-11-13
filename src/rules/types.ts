/**
 * RuneGate Companion – regeldata-skema (UDKAST v0.1)
 *
 * Regeldata er alt, der kommer fra regelbogen. Det er read-only for appen,
 * versioneret pr. udgave af bogen og ligger som JSON i repoet.
 * Spillernes egne data (karakterer, inventory, kampagner) ligger IKKE her,
 * men i Supabase, og refererer til regeldata via stabile ID'er.
 */

// ---------------------------------------------------------------------------
// Fælles byggeklodser
// ---------------------------------------------------------------------------

/**
 * Stabilt ID: "<type>.<slug>" – fx "feat.riposte", "skill.combat-melee-axes".
 * Ændrer sig ALDRIG mellem versioner af bogen, selv hvis navnet rettes.
 * Omdøbninger håndteres via `aliases`.
 */
export type Id = string;

/** Hvor i bogen en regel kommer fra – til sporbarhed og "vis i bogen". */
export interface SourceRef {
  book: "core";
  version: string; // fx "2026-09-19"
  page: number; // sidetal som trykt i bogen ("Page X af 214")
  section?: string; // overskrift, fx "Warrior: Feats"
}

/** Felter alle regel-entiteter har. */
export interface RuleEntity {
  id: Id;
  name: string;
  /** Alternative stavemåder, der henviser til samme regel (fx "Traveller"). */
  aliases?: string[];
  /** Fuld regeltekst, ordret fra bogen (vises i regelopslag). */
  text: string;
  source: SourceRef;
  /** Felter, importen ikke kunne tolke sikkert – vises i konfliktlisten. */
  reviewNotes?: string[];
  /**
   * Husfortolkninger: afgørelser, hvor bogen er uklar eller selvmodsigende
   * (se docs/conflicts.md). Vises i appen under regelteksten, så spillerne kan se dem.
   */
  clarifications?: string[];
}

export type Attribute = "STR" | "CON" | "DEX" | "INT" | "WIS" | "CHA";
export type Save = "fortitude" | "reaction" | "willpower";
export type Currency = "gp" | "sp" | "bp" | "cp";

export interface Price {
  amount: number;
  currency: Currency;
}

// ---------------------------------------------------------------------------
// Modifiers – kernen i "hvor kommer +3 fra?"
// ---------------------------------------------------------------------------

/**
 * Bogen s. 12: condition-modifiers stabler; item- og magical-modifiers stabler
 * IKKE indbyrdes (kun den højeste tæller), men de tre typer stabler med hinanden.
 * "score" bruges til ancestry-justeringer af selve attributscoren (ikke en bonus).
 */
export type ModifierType = "condition" | "item" | "magical" | "score";

/** Hvad en modifier påvirker. Skills/saves refereres med ID. */
export type ModifierTarget =
  | { kind: "attribute"; attribute: Attribute }
  | { kind: "save"; save: Save | "all" | "death" }
  /**
   * skill: et skill-ID, "all", et mønster ("skill.combat-melee-*" = alle melee-skills)
   * eller en reference til et valg spilleren har truffet ("$choice.weapon").
   */
  | { kind: "skill"; skill: Id | "all" }
  | {
      kind: "stat";
      stat:
        | "BP" | "MP" | "SPD" | "DFR" | "TOU" | "WT" | "INIT" | "Carry"
        | "DMR" | "skillPointsPerLevel" | "dexToDFR" | "movement";
    };

export interface Modifier {
  target: ModifierTarget;
  /** "add" (standard) lægger value til; "cap" sætter et loft (fx Treegon: maks +3 DEX til DFR). */
  operation?: "add" | "cap";
  value: number;
  type: ModifierType;
  /**
   * "always": regnes automatisk med på arket.
   * "situational": gælder kun under en betingelse (fx "i cover", "unarmed").
   *   Vises ved værdien, men lægges ikke til automatisk.
   */
  applies: "always" | "situational";
  /** Betingelsen i klar tekst, når applies = situational. */
  condition?: string;
}

// ---------------------------------------------------------------------------
// Forudsætninger og valg
// ---------------------------------------------------------------------------

export type Prerequisite =
  | { kind: "attribute"; attribute: Attribute; min: number } // "STR(10)"
  | { kind: "ancestry"; ancestry: Id }
  | { kind: "feat"; feat: Id }
  | { kind: "featCount"; min: number; counts: "nonBonus" } // bonus-feats
  /** Fallback: forudsætning importen ikke kunne tolke – tjekkes ikke automatisk. */
  | { kind: "text"; text: string };

/** Et valg spilleren skal træffe, når en regel tages (fx "vælg et våben"). */
export interface Choice {
  key: string; // fx "weapon", "realm", "language"
  prompt: string;
  /** Hvad der kan vælges fra – en regeldata-kategori eller fri tekst. */
  from:
    | { kind: "weapon" }
    | { kind: "weaponGroup" }
    | { kind: "armorGroup" }
    | { kind: "realm" }
    /** Human: én attribut +2 ELLER to attributter +1 → patterns [[2], [1, 1]]. */
    | { kind: "attributeBoost"; patterns: number[][] }
    | { kind: "skill" }
    | { kind: "language" }
    | { kind: "animalGroup" }
    | { kind: "freeText" };
}

// ---------------------------------------------------------------------------
// Handlinger (action-ikonerne i bogen)
// ---------------------------------------------------------------------------

/**
 * Bogen bruger ikoner: ● = 1 action (●● = 2, ●●● = 3), ⊙ = free action,
 * ↶ = reaction. Udtrækkes fra PDF'ens Wingdings-tegn (U+F06C, U+F0A4, U+F0C5/C6).
 */
export type ActionCost =
  | { kind: "action"; count: 1 | 2 | 3 }
  | { kind: "free" }
  | { kind: "reaction"; count: 1 | 2 };

// ---------------------------------------------------------------------------
// Entiteter
// ---------------------------------------------------------------------------

export interface AncestryTrait {
  name: string;
  text: string;
  modifiers: Modifier[];
}

export interface Ancestry extends RuleEntity {
  /** Faste scorejusteringer (Elf: DEX +2 …) */
  modifiers: Modifier[];
  /** Valg ved oprettelse (Human: én attribut +2 eller to attributter +1). */
  choices: Choice[];
  traits: AncestryTrait[];
  /** Begrænsninger, fx Treegon "kan ikke bære rustning og våben". */
  restrictions?: string[];
}

export interface Archetype extends RuleEntity {
  /** Flavor-tekst og typeeksempler fra kapitlets indledning. */
  examples?: string;
}

export type FeatTag =
  | "Passive" | "Buff" | "DeBuff" | "Attack" | "Bonus" | "Magic"
  | "Enable" | "Defense" | "Skill" | "Heal" | "Concentration"
  | "Movement" | "Stance" | "Disengage" | "Companion" | "AoE" | "Morph";

export interface Feat extends RuleEntity {
  /** Archetype- eller ancestry-ID, feat'en hører under. "archetype.universal" for Universal. */
  group: Id;
  tags: FeatTag[];
  /** Bonus-feats låses op automatisk (se prerequisites.featCount). */
  isBonus: boolean;
  action: ActionCost | null;
  cost?: { bp?: number; mp?: number; variable?: boolean };
  range?: string;
  prerequisites: Prerequisite[];
  /** Prerequisites-linjen ordret, til visning og kontrol. */
  prerequisitesText: string;
  /** Maskinlæsbare effekter. Tom liste = effekten er kun beskrevet i teksten. */
  modifiers: Modifier[];
  choices: Choice[];
  /**
   * Feats med samme nøgle er én og samme feat, uanset archetype, og kan kun tages én gang
   * (fx "Magic study I: Warding" under tre archetypes – konflikt F2).
   */
  equivalenceKey?: string;
  /** Magic study-feats: giver adgang til spells op til et level. */
  grantsSpellAccess?: { realmOrDomain: Id; maxLevel: number };
}

export interface BackgroundSkillRanks {
  /** Skill-ID, eller et "slot" spilleren selv udfylder (Weapon #1, Armor #1). */
  skill: Id | { slot: "weapon" | "armor"; index: number };
  ranks: number;
}

export interface Background extends RuleEntity {
  benefit:
    | { kind: "feat"; feat: Id }
    | { kind: "socialStanding"; min: number }
    | { kind: "text"; text: string };
  skillRanks: BackgroundSkillRanks[];
}

export interface Skill extends RuleEntity {
  /** null for armor-skills: DEX tæller allerede i DFR (konflikt K3). */
  attribute: Attribute | null;
  /** Kategori: almindelig skill, våbengruppe, armor-gruppe, magi-realm. */
  category: "general" | "combatMelee" | "combatRanged" | "armor" | "magic";
  /** Combat- og magi-skills er "familier" af separate skills, fx Combat: Melee → Axes. */
  family?: string;
  /** Hvilken rustningsstraf der rammer skill'en (bogen s. 126). */
  armorPenalty: "maneuver" | "magic" | "none";
  subskills: { name: string; text: string }[];
}

export interface PropertyDefinition extends RuleEntity {
  appliesTo: "melee" | "ranged" | "armor" | "shield";
  /** Om egenskaben har en parameter, fx Fast (5), Reach (4), Thrown (S). */
  param: "none" | "number" | "rangeBand" | "dmr";
}

export interface PropertyRef {
  property: Id;
  param?: number | string;
}

export interface Weapon extends RuleEntity {
  kind: "melee" | "ranged";
  /** Våbengruppe = combat-skill, fx "skill.combat-melee-axes". */
  group: Id;
  dmg: number | null; // null for Unarmed ("*")
  enc: number | null;
  str: number | null;
  range?: string; // "S", "M/L" …
  ammo?: number;
  price: Price | null;
  properties: PropertyRef[];
}

export interface Armor extends RuleEntity {
  armorClass: "light" | "medium" | "heavy" | "shield";
  dfr: number;
  tou: number;
  dexCap: number | null; // null = intet loft
  str: number | null;
  enc: number;
  skillPenalty: number; // maneuver-straf (negativ)
  spellPenalty: number; // magi-straf (negativ)
  price: Price | null;
  properties: PropertyRef[];
}

export type SpellVariableName =
  | "range" | "blast" | "burst" | "zone" | "duration" | "dmr" | "intensity";

/** "Base / Heightened" fra spell-tabellen. null = "-" (ikke relevant / kan ikke heightenes). */
export interface SpellVariable {
  base: string | null; // fx "10", "S", "1h", "HDC"
  step: string | null; // fx "5", "1h", "1"
}

export interface Spell extends RuleEntity {
  level: number;
  realm: Id; // "realm.elementalism"
  domain: Id; // "domain.fire"
  tags: string[]; // Attack, Defense, Directed, AoE, Concentration, Enable …
  variables: Record<SpellVariableName, SpellVariable>;
}

/** Tabeller og konstanter, regelmotoren bruger (formlerne selv ligger i kode). */
export interface Progression {
  standardArray: number[];
  attributeModifierTable: { min: number; max: number; modifier: number }[];
  startingSkillPoints: number;
  skillPointsPerLevel: number;
  /** Pris for rank #1 og #2 i samme skill på samme level. */
  rankCost: [number, number];
  /** Aftagende udbytte: ranks 1-10 = 1, 11-30 = 0.5, 31+ = 0.25 (rundes ned). */
  rankBonusBands: { fromRank: number; toRank: number | null; perRank: number }[];
  startingFeats: number;
  startingSaveProficiencyPoints: number;
  xpPerLevel: number;
  /** Møntværdier i kobber (konflikt E1): 1 gp = 10 sp = 100 bp = 1000 cp. */
  currencyInCopper: Record<Currency, number>;
  levels: {
    level: number;
    feats?: number;
    bpOrMp?: number;
    saveProficiencyPoints?: number;
    attributePoints?: number;
  }[];
  socialStanding: { roll: [number, number]; status: string; wealth: Price }[];
}

/** Hele regelpakken for én version af bogen. */
export interface RulesPackage {
  meta: { book: "core"; version: string; importedAt: string; sourceFile: string };
  progression: Progression;
  ancestries: Ancestry[];
  archetypes: Archetype[];
  feats: Feat[];
  backgrounds: Background[];
  skills: Skill[];
  properties: PropertyDefinition[];
  weapons: Weapon[];
  armor: Armor[];
  spells: Spell[];
}
