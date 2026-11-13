/**
 * Validering af et build mod reglerne. Returnerer en liste af problemer i stedet for at kaste fejl,
 * så guiden kan vise dem løbende ("2 skill points tilbage", "STR(13) kræves for …").
 */
import type { Ancestry, Background, Feat, Prerequisite, RulesPackage } from "../rules/types.ts";
import type { CharacterBuild, InventoryItem } from "../character/types.ts";
import { allFeatPicks, ATTRIBUTES, computeSheet, RulesIndex, SAVES, type Sheet } from "./compute.ts";

export interface Issue {
  severity: "error" | "warning";
  code: string;
  message: string;
  level?: number;
}

export function validateBuild(build: CharacterBuild, inventory: InventoryItem[], rules: RulesPackage,
  ix = new RulesIndex(rules), sheet: Sheet = computeSheet(build, inventory, rules, ix)): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string, level?: number) => issues.push({ severity: "error", code, message, level });
  const warn = (code: string, message: string, level?: number) => issues.push({ severity: "warning", code, message, level });
  const prog = rules.progression;
  const L = build.levels.length;

  if (L < 1) err("level.none", "The character needs at least level 1.");

  // --- Attributter ------------------------------------------------------------------------
  if (build.attributeMethod === "standardArray") {
    const got = ATTRIBUTES.map((a) => build.baseAttributes[a]).sort((a, b) => b - a);
    const want = [...prog.standardArray].sort((a, b) => b - a);
    if (got.join() !== want.join()) err("attr.array", `Use each standard array value once: ${want.join(", ")}.`);
  }
  const ancestry = ix.get<Ancestry>(build.ancestry, "ancestry");
  if (!ancestry) err("ancestry.missing", "Choose an ancestry.");
  const boostChoice = ancestry?.choices.find((c) => c.from.kind === "attributeBoost");
  if (boostChoice && boostChoice.from.kind === "attributeBoost") {
    const vals = Object.values(build.ancestryChoices.attributeBoost ?? {}).filter((v) => v).sort((a, b) => b! - a!);
    const ok = boostChoice.from.patterns.some((p) => [...p].sort((a, b) => b - a).join() === vals.join());
    if (!ok) err("ancestry.boost", `${ancestry!.name}: ${boostChoice.prompt}.`);
  } else if (Object.keys(build.ancestryChoices.attributeBoost ?? {}).length) {
    err("ancestry.boost.unexpected", `${ancestry?.name ?? "This ancestry"} has no free attribute bonus.`);
  }

  // --- Background ---------------------------------------------------------------------------
  const bg = ix.get<Background>(build.background, "background");
  if (!bg) err("background.missing", "Choose a background.");
  for (const r of bg?.skillRanks ?? []) {
    if (typeof r.skill === "string") continue;
    const chosen = build.backgroundSlots[r.skill.slot]?.[r.skill.index - 1];
    const label = `${r.skill.slot === "weapon" ? "Weapon" : "Armor"} #${r.skill.index}`;
    if (!chosen) err("background.slot", `${bg!.name}: choose a skill for ${label}.`);
    else {
      const sk = ix.skill(chosen);
      const okCat = r.skill.slot === "weapon" ? sk?.category.startsWith("combat") : sk?.category === "armor";
      if (!okCat) err("background.slot.kind", `${bg!.name}: ${label} must be a ${r.skill.slot} skill.`);
    }
  }

  // --- Pr. level: attributpoint, BP/MP, save-point, ranks --------------------------------------
  build.levels.forEach((lvl, i) => {
    const n = i + 1;
    const row = prog.levels.find((l) => l.level === n);
    if (row?.attributePoints) {
      const inc = lvl.attributeIncreases;
      if (!inc) err("level.attr", `Level ${n}: add +1 to two different attributes.`, n);
      else if (inc[0] === inc[1]) err("level.attr.same", `Level ${n}: the two attribute points must go to different attributes.`, n);
    } else if (lvl.attributeIncreases) err("level.attr.unexpected", `Level ${n} gives no attribute points.`, n);
    if (row?.bpOrMp && !lvl.bpOrMp) err("level.bpmp", `Level ${n}: choose +5 BP or +5 MP.`, n);
    if (!row?.bpOrMp && lvl.bpOrMp) err("level.bpmp.unexpected", `Level ${n} gives no BP or MP.`, n);

    const savePts = n === 1 ? prog.startingSaveProficiencyPoints : (row?.saveProficiencyPoints ?? 0);
    const usedSave = SAVES.reduce((s, sv) => s + (lvl.saveProficiency[sv] ?? 0), 0);
    if (usedSave !== savePts) {
      (usedSave > savePts ? err : warn)("level.saves", `Level ${n}: ${usedSave} of ${savePts} save points used.`, n);
    }
    for (const [id, cnt] of Object.entries(lvl.skillRanks)) {
      if (!ix.skill(id)) err("skill.unknown", `Level ${n}: unknown skill ${id}.`, n);
      if (cnt > 2) err("skill.cap", `Level ${n}: at most 2 ranks in a skill per level.`, n);
    }
  });

  // --- Skill points ------------------------------------------------------------------------------
  const { available, spent } = sheet.skillPoints;
  if (spent > available) err("skill.points", `${spent} skill points spent, but only ${available} available.`);
  else if (spent < available) warn("skill.points.left", `${available - spent} skill points not spent yet.`);

  // --- Feats ---------------------------------------------------------------------------------------
  const picks = allFeatPicks(build, ix).filter((p) => !p.fromBackground);
  build.levels.forEach((lvl, i) => lvl.feats.forEach((p) => {
    if (!ix.feat(p.feat)) err("feat.unknown", `Level ${i + 1}: unknown feat ${p.feat}.`, i + 1);
  }));
  const regular = picks.filter((p) => !p.feat.isBonus);
  const bonus = picks.filter((p) => p.feat.isBonus);
  const regularAllowed = prog.startingFeats + prog.levels.filter((l) => l.level <= L && l.feats).reduce((s, l) => s + l.feats!, 0);
  if (regular.length > regularAllowed) err("feat.count", `${regular.length} feats chosen, but only ${regularAllowed} available.`);
  else if (regular.length < regularAllowed) warn("feat.count.left", `${regularAllowed - regular.length} feat(s) not chosen yet.`);
  const bonusAllowed = Math.floor(regular.length / 3);
  if (bonus.length > bonusAllowed) err("feat.bonus", `${bonus.length} bonus feat(s) chosen, but only ${bonusAllowed} unlocked (1 per 3 regular feats).`);

  // Samme feat (eller samme equivalenceKey) to gange
  const seen = new Map<string, string>();
  for (const p of allFeatPicks(build, ix)) {
    const key = p.feat.equivalenceKey ?? p.feat.id;
    if (seen.has(key)) err("feat.duplicate", `${p.feat.name} is chosen more than once.`);
    seen.set(key, p.feat.id);
  }
  const hasFeat = (id: string) => seen.has(ix.feat(id)?.equivalenceKey ?? id);

  for (const p of allFeatPicks(build, ix)) {
    for (const pre of p.feat.prerequisites) {
      const problem = checkPrereq(pre, sheet, build, regular.length, hasFeat, ix);
      if (problem === "unchecked") warn("feat.prereq.text", `${p.feat.name}: check the prerequisite "${(pre as any).text}" yourself.`, p.level);
      else if (problem) err("feat.prereq", `${p.feat.name}: ${problem}.`, p.level);
    }
    for (const c of p.feat.choices) {
      if (!p.choices?.[c.key]) err("feat.choice", `${p.feat.name}: ${c.prompt}.`, p.level);
    }
  }
  return issues;
}

function checkPrereq(pre: Prerequisite, sheet: Sheet, build: CharacterBuild, regularCount: number,
  hasFeat: (id: string) => boolean, ix: RulesIndex): string | null | "unchecked" {
  switch (pre.kind) {
    case "attribute": {
      const v = sheet.attributes[pre.attribute].score.total;
      return v >= pre.min ? null : `requires ${pre.attribute}(${pre.min}), you have ${v}`;
    }
    case "ancestry": return build.ancestry === pre.ancestry ? null : `requires ancestry ${ix.get<any>(pre.ancestry)?.name ?? pre.ancestry}`;
    case "feat": return hasFeat(pre.feat) ? null : `requires the feat ${ix.feat(pre.feat)?.name ?? pre.feat}`;
    case "featCount": return regularCount >= pre.min ? null : `requires ${pre.min} regular feats`;
    case "text": return "unchecked";
  }
}

/** Kan feat'en vælges nu? Bruges af feat-vælgeren i guiden. */
export function featAvailability(feat: Feat, build: CharacterBuild, sheet: Sheet, ix: RulesIndex):
  { ok: boolean; reasons: string[]; unchecked: string[] } {
  const picks = allFeatPicks(build, ix);
  const regular = picks.filter((p) => !p.fromBackground && !p.feat.isBonus).length;
  const keys = new Set(picks.map((p) => p.feat.equivalenceKey ?? p.feat.id));
  const hasFeat = (id: string) => keys.has(ix.feat(id)?.equivalenceKey ?? id);
  const reasons: string[] = [];
  const unchecked: string[] = [];
  if (keys.has(feat.equivalenceKey ?? feat.id)) reasons.push("already chosen");
  for (const pre of feat.prerequisites) {
    const r = checkPrereq(pre, sheet, build, regular, hasFeat, ix);
    if (r === "unchecked") unchecked.push((pre as { text: string }).text);
    else if (r) reasons.push(r);
  }
  return { ok: reasons.length === 0, reasons, unchecked };
}
