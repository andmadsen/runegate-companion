/**
 * Spells (bogen s. 127 og 152-153 + husfortolkninger K11-K13 i docs/conflicts.md).
 *
 * - Hver "Magic study"-feat giver adgang til et tier (Study I = level 1-5, II = 6-10 …)
 *   i et realm (alle dets domæner) eller i ét domæne.
 * - Ved oprettelse: 3 spells pr. tier, man har en study-feat til ved level 1 (K11: pr. feat, ikke pr. domæne).
 * - Senere lærer man spells i spillet (ingen grænse), så længe de er inden for ens adgang.
 * - Memoriserede spells pr. study-gruppe (K12): 5 + realmets attribut-modifier + ½ hero level.
 * - Cantrip rank = skill-total i realmets casting-skill.
 */
import type { Id, RulesPackage, Spell } from "../rules/types.ts";
import type { CharacterBuild, PlayState } from "../character/types.ts";
import { allFeatPicks, type RulesIndex, type Sheet } from "./compute.ts";

export interface SpellGroup {
  /** realm.* eller domain.* – det study-feat'en gælder for. */
  id: Id;
  name: string;
  realm: RulesPackage["progression"]["realms"][number];
  domains: Id[];
  /** Højeste tier (study-niveau) nu og ved level 1. */
  tier: number;
  tierAtLevel1: number;
  maxLevel: number;
  memorizedLimit: number;
  cantripRank: number;
}

export function spellGroups(build: CharacterBuild, sheet: Sheet, rules: RulesPackage, ix: RulesIndex): SpellGroup[] {
  const prog = rules.progression;
  const byGroup = new Map<Id, { tier: number; tierAtLevel1: number }>();
  for (const p of allFeatPicks(build, ix)) {
    const acc = p.feat.grantsSpellAccess;
    if (!acc) continue;
    const tier = Math.ceil(acc.maxLevel / prog.spellLevelsPerTier);
    const cur = byGroup.get(acc.realmOrDomain) ?? { tier: 0, tierAtLevel1: 0 };
    cur.tier = Math.max(cur.tier, tier);
    if (p.level === 1) cur.tierAtLevel1 = Math.max(cur.tierAtLevel1, tier);
    byGroup.set(acc.realmOrDomain, cur);
  }
  const out: SpellGroup[] = [];
  for (const [id, t] of byGroup) {
    const realm = prog.realms.find((r) => r.id === id || r.domains.some((d) => d.id === id));
    if (!realm) continue;
    const domain = realm.domains.find((d) => d.id === id);
    const skillLine = sheet.skills.find((s) => s.skill.id === realm.skill);
    const attr = ix.skill(realm.skill)?.attribute;
    out.push({
      id, name: domain ? domain.name : realm.name, realm,
      domains: domain ? [domain.id] : realm.domains.map((d) => d.id),
      tier: t.tier, tierAtLevel1: t.tierAtLevel1, maxLevel: t.tier * prog.spellLevelsPerTier,
      memorizedLimit: prog.memorizedSpellsBase + (attr ? sheet.attributes[attr].modifier : 0) + Math.floor(sheet.level / 2),
      cantripRank: skillLine?.value.total ?? 0,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Den gruppe, en spell hører under for karakteren (domæne-studie foretrækkes frem for realm). */
export function groupForSpell(spell: Spell, groups: SpellGroup[]): SpellGroup | undefined {
  const candidates = groups.filter((g) => g.domains.includes(spell.domain) && spell.level <= g.maxLevel);
  return candidates.find((g) => g.id === spell.domain) ?? candidates[0];
}

export const spellTier = (spell: Spell, rules: RulesPackage) => Math.ceil(spell.level / rules.progression.spellLevelsPerTier);

/** Hvor mange startspells må vælges pr. gruppe og tier, plus ekstra fra background. */
export function startingSpellAllowance(build: CharacterBuild, groups: SpellGroup[], rules: RulesPackage, ix: RulesIndex) {
  const perTier = new Map<string, number>();
  for (const g of groups) for (let t = 1; t <= g.tierAtLevel1; t++) perTier.set(`${g.id}#${t}`, rules.progression.startingSpellsPerTier);
  const bg = ix.get<{ benefit: { kind: string; group?: Id; count?: number } }>(build.background, "background");
  const extra = bg?.benefit.kind === "extraSpells" && groups.some((g) => g.id === bg.benefit.group || g.domains.includes(bg.benefit.group!))
    ? { group: bg.benefit.group!, count: bg.benefit.count! } : null;
  return { perTier, extra };
}

export interface SpellLine {
  spell: Spell;
  source: "start" | "learned";
  group?: SpellGroup;
  memorized: boolean;
  /** Basispris i MP og basis-DC = spellens level (s. 153). */
  mpCost: number;
  cantrip: boolean;
}

export function spellLines(build: CharacterBuild, play: PlayState | undefined, groups: SpellGroup[], ix: RulesIndex): SpellLine[] {
  const mem = new Set(play?.memorizedSpells ?? []);
  return (build.spells ?? []).flatMap((s) => {
    const spell = ix.get<Spell>(s.spell, "spell");
    if (!spell) return [];
    const group = groupForSpell(spell, groups);
    return [{ spell, source: s.source, group, memorized: mem.has(spell.id), mpCost: spell.level,
      cantrip: !!group && spell.level <= group.cantripRank }];
  }).sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name));
}
