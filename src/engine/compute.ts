/**
 * Regelmotoren: build + inventory + regeldata → et komplet character sheet.
 * Formlerne følger bogen s. 16-18 og 126-129 samt husfortolkningerne i docs/conflicts.md.
 * Rene funktioner uden sideeffekter, så de er nemme at teste.
 */
import type { Armor, Attribute, Feat, Id, RulesPackage, Save, Skill, Weapon } from "../rules/types.ts";
import type { CharacterBuild, InventoryItem } from "../character/types.ts";
import { basePart, stack, value, type Part, type SourcedModifier, type Value } from "./modifiers.ts";

export const ATTRIBUTES: Attribute[] = ["STR", "CON", "DEX", "INT", "WIS", "CHA"];
export const SAVES: Save[] = ["fortitude", "reaction", "willpower"];
const SAVE_ATTRS: Record<Save, [Attribute, Attribute]> = {
  fortitude: ["STR", "CON"], reaction: ["DEX", "INT"], willpower: ["WIS", "CHA"],
};

/** Opslag i regelpakken. Bygges én gang pr. regelversion. */
export class RulesIndex {
  readonly byId = new Map<Id, { kind: string; entity: any }>();
  readonly rules: RulesPackage;
  constructor(rules: RulesPackage) {
    this.rules = rules;
    const add = (kind: string, list: { id: Id }[]) => list.forEach((e) => this.byId.set(e.id, { kind, entity: e }));
    add("ancestry", rules.ancestries); add("archetype", rules.archetypes); add("feat", rules.feats);
    add("background", rules.backgrounds); add("skill", rules.skills); add("property", rules.properties);
    add("weapon", rules.weapons); add("armor", rules.armor); add("spell", rules.spells);
  }
  get<T>(id: Id, kind?: string): T | undefined {
    const hit = this.byId.get(id);
    return hit && (!kind || hit.kind === kind) ? (hit.entity as T) : undefined;
  }
  feat(id: Id) { return this.get<Feat>(id, "feat"); }
  skill(id: Id) { return this.get<Skill>(id, "skill"); }
}

export const attributeModifier = (score: number) => Math.floor((score - 10) / 2);

/** Rank-bonus med aftagende udbytte (s. 126): 1-10 → 1, 11-30 → 0,5, 31+ → 0,25. Rundes ned. */
export function rankBonus(ranks: number, rules: RulesPackage): number {
  let bonus = 0;
  for (const b of rules.progression.rankBonusBands) {
    const to = b.toRank ?? Infinity;
    const inBand = Math.max(0, Math.min(ranks, to) - b.fromRank + 1);
    bonus += inBand * b.perRank;
  }
  return Math.floor(bonus);
}

export interface SkillLine {
  skill: Skill;
  ranks: number;
  value: Value;
}

export interface Sheet {
  level: number;
  attributes: Record<Attribute, { score: Value; modifier: number }>;
  saves: Record<Save, Value>;
  bp: Value; mp: Value; mpBoundByAttunement: number;
  carry: Value; enc: number; overload: number;
  spd: Value; dfr: Value; tou: Value; wt: Value; hdc: Value; initiative: Value;
  skills: SkillLine[];
  feats: { feat: Feat; level: number; choices?: Record<string, string> }[];
  backgroundFeat?: Feat;
  wornArmor?: Armor; wornShield?: Armor;
  /** Situationsbestemte modifiers samlet ét sted, til visning. */
  situational: Part[];
  skillPoints: { available: number; spent: number };
}

/** Saml alle modifiers fra ancestry, feats, background og udstyr – med kilde. */
export function collectModifiers(build: CharacterBuild, inventory: InventoryItem[], ix: RulesIndex): SourcedModifier[] {
  const out: SourcedModifier[] = [];
  const ancestry = ix.get<any>(build.ancestry, "ancestry");
  if (ancestry) {
    for (const m of ancestry.modifiers) out.push({ modifier: m, source: `Ancestry: ${ancestry.name}` });
    for (const t of ancestry.traits) for (const m of t.modifiers) out.push({ modifier: m, source: `${ancestry.name}: ${t.name}` });
  }
  for (const [attr, v] of Object.entries(build.ancestryChoices.attributeBoost ?? {})) {
    out.push({ modifier: { target: { kind: "attribute", attribute: attr as Attribute }, value: v!, type: "score", applies: "always" },
      source: `Ancestry: ${ancestry?.name ?? "?"} (chosen)` });
  }
  const picks = allFeatPicks(build, ix);
  for (const { feat, choices } of picks) {
    for (const m of feat.modifiers) {
      let resolvedSkill: string | undefined;
      if (m.target.kind === "skill" && m.target.skill.startsWith("$choice.")) {
        const choiceId = choices?.[m.target.skill.slice("$choice.".length)];
        resolvedSkill = choiceId ? skillForChoice(choiceId, ix) : undefined;
        if (!resolvedSkill) continue; // valget er ikke truffet endnu
      }
      out.push({ modifier: m, source: `Feat: ${feat.name}`, resolvedSkill });
    }
  }
  for (const item of inventory) {
    if (!item.equipped || !item.custom?.modifiers) continue;
    if (item.custom.attunementMp && !item.attuned) continue;
    for (const m of item.custom.modifiers) out.push({ modifier: m, source: `Item: ${item.custom.name}` });
  }
  return out;
}

/** Et valg kan være et våben (→ dets våbengruppe-skill), en skill eller et realm (→ magi-skill). */
function skillForChoice(choice: string, ix: RulesIndex): string | undefined {
  const w = ix.get<Weapon>(choice, "weapon");
  if (w) return w.group;
  if (ix.skill(choice)) return choice;
  if (choice.startsWith("realm.")) return `skill.magic-${choice.slice("realm.".length)}`;
  return undefined;
}

/** Alle feats på karakteren inkl. background-feat'en. */
export function allFeatPicks(build: CharacterBuild, ix: RulesIndex) {
  const out: { feat: Feat; level: number; choices?: Record<string, string>; fromBackground?: boolean }[] = [];
  build.levels.forEach((lvl, i) => lvl.feats.forEach((p) => {
    const feat = ix.feat(p.feat);
    if (feat) out.push({ feat, level: i + 1, choices: p.choices as Record<string, string> });
  }));
  const bg = ix.get<any>(build.background, "background");
  if (bg?.benefit.kind === "feat") {
    const feat = ix.feat(bg.benefit.feat);
    if (feat) out.push({ feat, level: 1, fromBackground: true });
  }
  return out;
}

/** Ranks pr. skill: købte ranks på alle levels + gratis ranks fra background. */
export function skillRanks(build: CharacterBuild, ix: RulesIndex): Map<Id, number> {
  const ranks = new Map<Id, number>();
  const add = (id: Id, n: number) => ranks.set(id, (ranks.get(id) ?? 0) + n);
  for (const lvl of build.levels) for (const [id, n] of Object.entries(lvl.skillRanks)) add(id, n);
  const bg = ix.get<any>(build.background, "background");
  for (const r of bg?.skillRanks ?? []) {
    if (typeof r.skill === "string") add(r.skill, r.ranks);
    else {
      const filled = build.backgroundSlots[r.skill.slot as "weapon" | "armor"]?.[r.skill.index - 1];
      if (filled) add(filled, r.ranks);
    }
  }
  return ranks;
}

function itemEnc(item: InventoryItem, ix: RulesIndex): number {
  const cat = item.ref ? ix.get<any>(item.ref) : undefined;
  const enc = item.custom?.enc ?? cat?.enc ?? 0;
  return (enc ?? 0) * item.quantity;
}

function levelsUpTo(rules: RulesPackage, level: number) {
  return rules.progression.levels.filter((l) => l.level <= level);
}

export function computeSheet(build: CharacterBuild, inventory: InventoryItem[], rules: RulesPackage, ix = new RulesIndex(rules)): Sheet {
  const level = build.levels.length;
  const mods = collectModifiers(build, inventory, ix);

  // --- Attributter: base + ancestry + level-up-point ---------------------------------
  const attributes = {} as Sheet["attributes"];
  for (const a of ATTRIBUTES) {
    const base: Part[] = [basePart("Base score", build.baseAttributes[a])];
    const ups = build.levels.reduce((n, l) => n + (l.attributeIncreases?.filter((x) => x === a).length ?? 0), 0);
    if (ups) base.push(basePart("Level-ups", ups));
    const score = value(base, mods, `attr:${a}`);
    attributes[a] = { score, modifier: attributeModifier(score.total) };
  }
  const m = (a: Attribute) => attributes[a].modifier;
  const s = (a: Attribute) => attributes[a].score.total;
  const am = (a: Attribute) => basePart(`${a} modifier`, m(a));

  // --- Udstyr ------------------------------------------------------------------------------
  const worn = inventory.filter((i) => i.equipped && i.ref).map((i) => ix.get<Armor>(i.ref!, "armor")).filter(Boolean) as Armor[];
  const wornArmor = worn.find((a) => a.armorClass !== "shield");
  const wornShield = worn.find((a) => a.armorClass === "shield");

  const carry = value([basePart("Base", 10), basePart("STR score", s("STR")), am("STR")], mods, "stat:Carry");
  const enc = inventory.reduce((sum, i) => sum + itemEnc(i, ix), 0);
  const overload = Math.max(0, Math.floor(enc - carry.total));

  // --- Saves (s. 16) -------------------------------------------------------------------------
  const saves = {} as Sheet["saves"];
  for (const sv of SAVES) {
    const prof = build.levels.reduce((n, l) => n + (l.saveProficiency[sv] ?? 0), 0);
    const [a1, a2] = SAVE_ATTRS[sv];
    saves[sv] = value([am(a1), am(a2), basePart("Proficiency points", prof)], mods, `save:${sv}`, "save:all");
  }

  // --- Sekundære værdier (s. 17-18) ------------------------------------------------------------
  const levelBonus = (kind: "BP" | "MP") => 5 * build.levels.filter((l) => l.bpOrMp === kind).length;
  const bp = value([basePart("STR", s("STR")), am("STR"), basePart("CON", s("CON")), am("CON"),
    basePart("DEX", s("DEX")), am("DEX"), basePart("Level-ups", levelBonus("BP"))], mods, "stat:BP");
  const mp = value([basePart("INT", s("INT")), am("INT"), basePart("WIS", s("WIS")), am("WIS"),
    basePart("CHA", s("CHA")), am("CHA"), basePart("Level-ups", levelBonus("MP"))], mods, "stat:MP");
  const mpBoundByAttunement = inventory
    .filter((i) => i.attuned && i.custom?.attunementMp).reduce((n, i) => n + i.custom!.attunementMp!, 0);

  const spd = value([basePart("Base", 10), am("STR"), am("CON"), basePart("Overload", -overload)], mods, "stat:SPD", "stat:movement");

  // DFR: rustning og skjold er led i formlen, ikke item-modifiers – ellers ville de ikke stable.
  const armorSkill = ix.skill(`skill.armor-${wornArmor?.armorClass ?? "light"}`);
  const ranks = skillRanks(build, ix);
  const dexCaps = [wornArmor?.dexCap, wornShield?.dexCap].filter((c): c is number => c !== null && c !== undefined);
  const capFromMods = stack(mods, ["stat:dexToDFR"]).cap;
  if (capFromMods !== null) dexCaps.push(capFromMods);
  const dexCap = dexCaps.length ? Math.min(...dexCaps) : Infinity;
  const dexToDfr = Math.min(m("DEX"), dexCap);
  const dfr = value([
    basePart("Base", 8),
    basePart("DEX modifier", dexToDfr, dexToDfr < m("DEX") ? `capped at ${dexCap}` : undefined),
    basePart(`${armorSkill?.name ?? "Armor"} skill`, armorSkill ? rankBonus(ranks.get(armorSkill.id) ?? 0, rules) : 0),
    ...(wornArmor ? [basePart(wornArmor.name, wornArmor.dfr)] : []),
    ...(wornShield ? [basePart(wornShield.name, wornShield.dfr)] : []),
  ], mods, "stat:DFR");
  const tou = value([basePart("Base", 8), am("CON"),
    ...(wornArmor ? [basePart(wornArmor.name, wornArmor.tou)] : []),
    ...(wornShield ? [basePart(wornShield.name, wornShield.tou)] : []),
  ], mods, "stat:TOU");
  const wt = value([basePart("Base", 4), am("CON")], mods, "stat:WT");
  const highest = Math.max(...ATTRIBUTES.map(m));
  const hdc = value([basePart("Base", 10), basePart("Half level, rounded up", Math.ceil(level / 2)),
    basePart("Highest attribute modifier", highest)], mods, "stat:HDC");
  const initiative = value([basePart("Reaction save", saves.reaction.total), basePart("Overload", -overload)], mods, "stat:INIT");

  // --- Skills (s. 126-127) ----------------------------------------------------------------------
  const maneuverPenalty = (wornArmor?.skillPenalty ?? 0) + (wornShield?.skillPenalty ?? 0);
  const magicPenalty = (wornArmor?.spellPenalty ?? 0) + (wornShield?.spellPenalty ?? 0);
  const skills: SkillLine[] = rules.skills.map((sk) => {
    const r = ranks.get(sk.id) ?? 0;
    const base: Part[] = [basePart("Ranks", rankBonus(r, rules), `${r} ranks`)];
    if (sk.attribute) base.push(am(sk.attribute));
    if (sk.armorPenalty === "maneuver" && maneuverPenalty) base.push(basePart("Armor (maneuver penalty)", maneuverPenalty));
    if (sk.armorPenalty === "magic" && magicPenalty) base.push(basePart("Armor (magic penalty)", magicPenalty));
    if (sk.armorPenalty !== "none" && overload) base.push(basePart("Overload", -overload));
    return { skill: sk, ranks: r, value: value(base, mods, `skill:${sk.id}`) };
  });

  // --- Skill points ---------------------------------------------------------------------------
  const perLevelBonus = stack(mods, ["stat:skillPointsPerLevel"]).add;
  const available = rules.progression.startingSkillPoints + rules.progression.skillPointsPerLevel * (level - 1)
    + perLevelBonus * level;
  const [c1, c2] = rules.progression.rankCost;
  const spent = build.levels.reduce((sum, l) =>
    sum + Object.values(l.skillRanks).reduce((t, n) => t + (n >= 2 ? c1 + c2 : c1), 0), 0);

  const picks = allFeatPicks(build, ix);
  return {
    level, attributes, saves, bp, mp, mpBoundByAttunement, carry, enc, overload, spd, dfr, tou, wt, hdc, initiative,
    skills,
    feats: picks.filter((p) => !p.fromBackground),
    backgroundFeat: picks.find((p) => p.fromBackground)?.feat,
    wornArmor, wornShield,
    situational: mods.filter((x) => x.modifier.applies === "situational").map((x) => ({
      label: x.source, value: x.modifier.value, source: x.source, type: x.modifier.type, counted: false,
      note: `${describeTarget(x)}: ${x.modifier.condition ?? ""}`,
    })),
    skillPoints: { available, spent },
  };
}

function describeTarget(x: SourcedModifier): string {
  const t = x.modifier.target;
  switch (t.kind) {
    case "attribute": return t.attribute;
    case "save": return `${t.save} save`;
    case "skill": return x.resolvedSkill ?? t.skill;
    case "stat": return t.stat;
  }
}

export { levelsUpTo };
