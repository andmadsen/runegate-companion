/**
 * Validering af et build mod reglerne. Returnerer en liste af problemer i stedet for at kaste fejl,
 * så guiden kan vise dem løbende ("2 skill points tilbage", "STR(13) kræves for …").
 */
import type { Ancestry, Background, Prerequisite, RulesPackage } from "../rules/types.ts";
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

  if (L < 1) err("level.none", "Karakteren skal have mindst level 1.");

  // --- Attributter ------------------------------------------------------------------------
  if (build.attributeMethod === "standardArray") {
    const got = ATTRIBUTES.map((a) => build.baseAttributes[a]).sort((a, b) => b - a);
    const want = [...prog.standardArray].sort((a, b) => b - a);
    if (got.join() !== want.join()) err("attr.array", `Attributterne skal fordeles som standard array: ${want.join(", ")}.`);
  }
  const ancestry = ix.get<Ancestry>(build.ancestry, "ancestry");
  if (!ancestry) err("ancestry.missing", "Vælg en ancestry.");
  const boostChoice = ancestry?.choices.find((c) => c.from.kind === "attributeBoost");
  if (boostChoice && boostChoice.from.kind === "attributeBoost") {
    const vals = Object.values(build.ancestryChoices.attributeBoost ?? {}).filter((v) => v).sort((a, b) => b! - a!);
    const ok = boostChoice.from.patterns.some((p) => [...p].sort((a, b) => b - a).join() === vals.join());
    if (!ok) err("ancestry.boost", `${ancestry!.name}: ${boostChoice.prompt}.`);
  } else if (Object.keys(build.ancestryChoices.attributeBoost ?? {}).length) {
    err("ancestry.boost.unexpected", `${ancestry?.name ?? "Denne ancestry"} giver ikke frit valg af attributbonus.`);
  }

  // --- Background ---------------------------------------------------------------------------
  const bg = ix.get<Background>(build.background, "background");
  if (!bg) err("background.missing", "Vælg en background.");
  for (const r of bg?.skillRanks ?? []) {
    if (typeof r.skill === "string") continue;
    const chosen = build.backgroundSlots[r.skill.slot]?.[r.skill.index - 1];
    const label = `${r.skill.slot === "weapon" ? "Weapon" : "Armor"} #${r.skill.index}`;
    if (!chosen) err("background.slot", `${bg!.name}: vælg skill for ${label}.`);
    else {
      const sk = ix.skill(chosen);
      const okCat = r.skill.slot === "weapon" ? sk?.category.startsWith("combat") : sk?.category === "armor";
      if (!okCat) err("background.slot.kind", `${bg!.name}: ${label} skal være en ${r.skill.slot === "weapon" ? "våben" : "armor"}-skill.`);
    }
  }

  // --- Pr. level: attributpoint, BP/MP, save-point, ranks --------------------------------------
  build.levels.forEach((lvl, i) => {
    const n = i + 1;
    const row = prog.levels.find((l) => l.level === n);
    if (row?.attributePoints) {
      const inc = lvl.attributeIncreases;
      if (!inc) err("level.attr", `Level ${n}: fordel +1 på to forskellige attributter.`, n);
      else if (inc[0] === inc[1]) err("level.attr.same", `Level ${n}: de to attributpoint skal gå til forskellige attributter.`, n);
    } else if (lvl.attributeIncreases) err("level.attr.unexpected", `Level ${n} giver ikke attributpoint.`, n);
    if (row?.bpOrMp && !lvl.bpOrMp) err("level.bpmp", `Level ${n}: vælg +5 BP eller +5 MP.`, n);
    if (!row?.bpOrMp && lvl.bpOrMp) err("level.bpmp.unexpected", `Level ${n} giver ikke BP/MP.`, n);

    const savePts = n === 1 ? prog.startingSaveProficiencyPoints : (row?.saveProficiencyPoints ?? 0);
    const usedSave = SAVES.reduce((s, sv) => s + (lvl.saveProficiency[sv] ?? 0), 0);
    if (usedSave !== savePts) {
      (usedSave > savePts ? err : warn)("level.saves", `Level ${n}: ${usedSave} af ${savePts} save-point er fordelt.`, n);
    }
    for (const [id, cnt] of Object.entries(lvl.skillRanks)) {
      if (!ix.skill(id)) err("skill.unknown", `Level ${n}: ukendt skill ${id}.`, n);
      if (cnt > 2) err("skill.cap", `Level ${n}: højst 2 ranks i samme skill pr. level.`, n);
    }
  });

  // --- Skill points ------------------------------------------------------------------------------
  const { available, spent } = sheet.skillPoints;
  if (spent > available) err("skill.points", `Der er brugt ${spent} skill points, men kun ${available} til rådighed.`);
  else if (spent < available) warn("skill.points.left", `${available - spent} skill points er ikke brugt.`);

  // --- Feats ---------------------------------------------------------------------------------------
  const picks = allFeatPicks(build, ix).filter((p) => !p.fromBackground);
  build.levels.forEach((lvl, i) => lvl.feats.forEach((p) => {
    if (!ix.feat(p.feat)) err("feat.unknown", `Level ${i + 1}: ukendt feat ${p.feat}.`, i + 1);
  }));
  const regular = picks.filter((p) => !p.feat.isBonus);
  const bonus = picks.filter((p) => p.feat.isBonus);
  const regularAllowed = prog.startingFeats + prog.levels.filter((l) => l.level <= L && l.feats).reduce((s, l) => s + l.feats!, 0);
  if (regular.length > regularAllowed) err("feat.count", `${regular.length} feats valgt, men kun ${regularAllowed} til rådighed.`);
  else if (regular.length < regularAllowed) warn("feat.count.left", `${regularAllowed - regular.length} feat(s) er ikke valgt.`);
  const bonusAllowed = Math.floor(regular.length / 3);
  if (bonus.length > bonusAllowed) err("feat.bonus", `${bonus.length} bonus-feats valgt, men kun ${bonusAllowed} er låst op (1 pr. 3 almindelige feats).`);

  // Samme feat (eller samme equivalenceKey) to gange
  const seen = new Map<string, string>();
  for (const p of allFeatPicks(build, ix)) {
    const key = p.feat.equivalenceKey ?? p.feat.id;
    if (seen.has(key)) err("feat.duplicate", `${p.feat.name} er valgt mere end én gang.`);
    seen.set(key, p.feat.id);
  }
  const hasFeat = (id: string) => seen.has(ix.feat(id)?.equivalenceKey ?? id);

  for (const p of allFeatPicks(build, ix)) {
    for (const pre of p.feat.prerequisites) {
      const problem = checkPrereq(pre, sheet, build, regular.length, hasFeat, ix);
      if (problem === "unchecked") warn("feat.prereq.text", `${p.feat.name}: forudsætningen "${(pre as any).text}" tjekkes ikke automatisk.`, p.level);
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
      return v >= pre.min ? null : `kræver ${pre.attribute}(${pre.min}), har ${v}`;
    }
    case "ancestry": return build.ancestry === pre.ancestry ? null : `kræver ancestry ${ix.get<any>(pre.ancestry)?.name ?? pre.ancestry}`;
    case "feat": return hasFeat(pre.feat) ? null : `kræver feat'en ${ix.feat(pre.feat)?.name ?? pre.feat}`;
    case "featCount": return regularCount >= pre.min ? null : `kræver ${pre.min} almindelige feats`;
    case "text": return "unchecked";
  }
}
