/**
 * Regelmotor-tests. Forventede værdier er regnet i hånden efter bogen s. 16-18 og 126-129.
 * Kør: node --test test/
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { RulesPackage } from "../src/rules/types.ts";
import type { CharacterBuild, InventoryItem } from "../src/character/types.ts";
import { computeSheet, rankBonus, RulesIndex } from "../src/engine/compute.ts";
import { stack, type SourcedModifier } from "../src/engine/modifiers.ts";
import { validateBuild } from "../src/engine/validate.ts";

const rules: RulesPackage = JSON.parse(readFileSync(new URL("../data/rules/2026-09-19/rules.json", import.meta.url), "utf8"));
const ix = new RulesIndex(rules);
const skill = (sheet: ReturnType<typeof computeSheet>, id: string) => sheet.skills.find((s) => s.skill.id === id)!.value.total;
const errors = (b: CharacterBuild, inv: InventoryItem[] = []) => validateBuild(b, inv, rules, ix).filter((i) => i.severity === "error");

// ---------------------------------------------------------------------------------------------
// Brokk: Dwarf, City guard, level 1, chain mail + skjold + magisk ring
// ---------------------------------------------------------------------------------------------
const brokk: CharacterBuild = {
  schemaVersion: 1, rulesVersion: "2026-09-19", name: "Brokk",
  baseAttributes: { STR: 15, CON: 14, DEX: 12, INT: 10, WIS: 13, CHA: 8 }, attributeMethod: "standardArray",
  ancestry: "ancestry.dwarf", ancestryChoices: {},
  background: "background.city-guard",
  backgroundSlots: { weapon: ["skill.combat-melee-swords-and-knives"], armor: ["skill.armor-heavy"] },
  levels: [{
    feats: [{ feat: "feat.warrior.thick-skinned" }, { feat: "feat.warrior.melee-specialist" }, { feat: "feat.primal.primal-endurance" }],
    skillRanks: {
      "skill.combat-melee-swords-and-knives": 2, "skill.armor-heavy": 2, "skill.acrobatics-and-athletics": 2,
      "skill.perception-and-awareness": 2, "skill.survival-and-nature": 2, "skill.medical-and-care": 2,
      "skill.history-and-religion": 2, "skill.academics-and-science": 1, "skill.investigation-and-examination": 1,
      "skill.mechanics-and-machinery": 1, "skill.stalking-and-hiding": 1,
    },
    saveProficiency: { fortitude: 2, reaction: 1, willpower: 1 },
  }],
};
const brokkGear: InventoryItem[] = [
  { instanceId: "1", ref: "armor.chain-mail", quantity: 1, equipped: true },
  { instanceId: "2", ref: "armor.shield-normal", quantity: 1, equipped: true },
  { instanceId: "3", ref: "weapon.longsword", quantity: 1, equipped: true },
  { instanceId: "4", custom: { name: "Rope", enc: 2 }, quantity: 1, equipped: false },
  { instanceId: "5", quantity: 1, equipped: true, attuned: true, custom: {
    name: "Ring of protection", enc: 0, attunementMp: 3,
    modifiers: [{ target: { kind: "stat", stat: "DFR" }, value: 1, type: "magical", applies: "always" }] } },
];

describe("Brokk (Dwarf, level 1)", () => {
  const sheet = computeSheet(brokk, brokkGear, rules, ix);

  test("attributter inkl. dwarf-justeringer", () => {
    const got = Object.fromEntries(Object.entries(sheet.attributes).map(([k, v]) => [k, [v.score.total, v.modifier]]));
    assert.deepEqual(got, { STR: [16, 3], CON: [16, 3], DEX: [12, 1], INT: [10, 0], WIS: [14, 2], CHA: [6, -2] });
  });
  test("BP = 16+3+16+3+12+1 + Sturdy 10 + Primal endurance 20 = 81", () => assert.equal(sheet.bp.total, 81));
  test("MP = 10+0+14+2+6-2 = 30, heraf 3 bundet af attunement", () => {
    assert.equal(sheet.mp.total, 30); assert.equal(sheet.mpBoundByAttunement, 3);
  });
  test("Carry 29, ENC 22, ingen overload", () => {
    assert.equal(sheet.carry.total, 29); assert.equal(sheet.enc, 22); assert.equal(sheet.overload, 0);
  });
  test("SPD = 10+3+3 = 16", () => assert.equal(sheet.spd.total, 16));
  test("DFR = 8 + DEX (loft 0) + Armor: Heavy 4 + chain 6 + skjold 2 + ring 1 = 21", () => assert.equal(sheet.dfr.total, 21));
  test("TOU = 8+3+6+0 + Thick skinned 2 = 19", () => assert.equal(sheet.tou.total, 19));
  test("WT 7, HDC 14, INIT 2", () => {
    assert.equal(sheet.wt.total, 7); assert.equal(sheet.hdc.total, 14); assert.equal(sheet.initiative.total, 2);
  });
  test("saves: Fortitude 3+3+2+1(dwarf)=9, Reaction 2, Willpower 1", () => {
    assert.equal(sheet.saves.fortitude.total, 9); assert.equal(sheet.saves.reaction.total, 2); assert.equal(sheet.saves.willpower.total, 1);
  });
  test("skills: ranks + background + attribut + rustningsstraffe", () => {
    assert.equal(skill(sheet, "skill.combat-melee-swords-and-knives"), 7); // 4 ranks + STR 3
    assert.equal(skill(sheet, "skill.acrobatics-and-athletics"), 1);      // 2 + STR 3 - 4 maneuver
    assert.equal(skill(sheet, "skill.perception-and-awareness"), 4);      // 2 + 2 bg + INT 0
    assert.equal(skill(sheet, "skill.insight-and-persuasion"), 0);        // 2 bg + CHA -2
    assert.equal(skill(sheet, "skill.magic-elementalism"), -6);           // chain -4 + skjold -2
    assert.equal(skill(sheet, "skill.stalking-and-hiding"), -2);          // 1 + DEX 1 - 4
  });
  test("skill points 25/25 og background-feat", () => {
    assert.deepEqual(sheet.skillPoints, { available: 25, spent: 25 });
    assert.equal(sheet.backgroundFeat?.id, "feat.universal.city-navigator");
  });
  test("situationsbestemt: Melee specialist +1 DMR vises, men tælles ikke", () => {
    assert.ok(sheet.situational.some((p) => p.source === "Feat: Melee specialist" && p.value === 1 && !p.counted));
  });
  test("DFR-forklaring viser rustning, skjold og ring", () => {
    const labels = sheet.dfr.parts.map((p) => p.label);
    for (const l of ["Chain mail", "Shield (normal)", "Item: Ring of protection"]) assert.ok(labels.includes(l), l);
  });
  test("buildet er gyldigt", () => assert.deepEqual(errors(brokk, brokkGear), []));
});

// ---------------------------------------------------------------------------------------------
// Ilsa: Human, Noble, level 5 – level-ups, bonus-feat, magic study-kæde, attributpoint
// ---------------------------------------------------------------------------------------------
const el = "skill.magic-elementalism";
const ilsa: CharacterBuild = {
  schemaVersion: 1, rulesVersion: "2026-09-19", name: "Ilsa",
  baseAttributes: { STR: 8, CON: 12, DEX: 14, INT: 15, WIS: 13, CHA: 10 }, attributeMethod: "standardArray",
  ancestry: "ancestry.human", ancestryChoices: { attributeBoost: { INT: 2 } },
  background: "background.noble", backgroundSlots: { weapon: ["skill.combat-melee-polearms-and-staffs"] },
  levels: [
    { feats: [{ feat: "feat.universal.focused-learner" }, { feat: "feat.primal.magic-study-i-elementalism" }, { feat: "feat.human.fast-learner" }],
      skillRanks: { [el]: 2 }, saveProficiency: { willpower: 2, reaction: 2 } },
    { feats: [{ feat: "feat.primal.magic-study-ii-elementalism" }], skillRanks: { [el]: 2 }, saveProficiency: {} },
    { feats: [], skillRanks: { [el]: 2 }, saveProficiency: { reaction: 2 }, bpOrMp: "MP" },
    { feats: [{ feat: "feat.universal.in-our-maker-we-trust" }, { feat: "feat.warrior.tough-as-nails" }], skillRanks: { [el]: 2 }, saveProficiency: {} },
    { feats: [], skillRanks: { [el]: 2 }, saveProficiency: {}, attributeIncreases: ["INT", "DEX"] },
  ],
};

describe("Ilsa (Human, level 5)", () => {
  const sheet = computeSheet(ilsa, [], rules, ix);
  test("INT 15 + 2 (human) + 1 (level 5) = 18; DEX 15", () => {
    assert.equal(sheet.attributes.INT.score.total, 18); assert.equal(sheet.attributes.DEX.score.total, 15);
  });
  test("Elementalism: 10 ranks → +10, INT +4 = 14", () => assert.equal(skill(sheet, el), 14));
  test("skill points: 25 + 4×15 + 5×(2 human + 3 focused + 2 fast) = 120", () => assert.equal(sheet.skillPoints.available, 120));
  test("MP = 18+4+13+1+10+0 + 5 (level 3) = 51", () => assert.equal(sheet.mp.total, 51));
  test("HDC = 10 + 3 + 4 = 17", () => assert.equal(sheet.hdc.total, 17));
  test("Reaction = DEX 2 + INT 4 + 4 point = 10", () => assert.equal(sheet.saves.reaction.total, 10));
  test("DFR uden rustning = 8 + 2 = 10 (cover-bonus kun situationsbestemt)", () => assert.equal(sheet.dfr.total, 10));
  test("gyldigt build (kun advarsler om ubrugte skill points)", () => {
    const issues = validateBuild(ilsa, [], rules, ix);
    assert.deepEqual(issues.filter((i) => i.severity === "error"), []);
    assert.ok(issues.some((i) => i.code === "skill.points.left"));
  });
});

// ---------------------------------------------------------------------------------------------
// Validering: typiske fejl
// ---------------------------------------------------------------------------------------------
describe("validering", () => {
  const codes = (b: CharacterBuild) => errors(b).map((i) => i.code);
  const withLevel1 = (patch: Partial<CharacterBuild["levels"][0]>) =>
    ({ ...brokk, levels: [{ ...brokk.levels[0], ...patch }] });

  test("Magic study II uden I", () => {
    const b = { ...ilsa, levels: ilsa.levels.map((l, i) => i === 0 ? { ...l, feats: l.feats.filter((f) => !f.feat.includes("study-i-")) } : l) };
    assert.ok(codes(b).includes("feat.prereq"));
  });
  test("samme Magic study under to archetypes tæller som dublet", () => {
    const b = withLevel1({ feats: [{ feat: "feat.leader.magic-study-i-warding" }, { feat: "feat.mystic.magic-study-i-warding" }, { feat: "feat.warrior.thick-skinned" }] });
    assert.ok(codes(b).includes("feat.duplicate"));
  });
  test("for mange feats og bonus-feat for tidligt", () => {
    const b = withLevel1({ feats: [...brokk.levels[0].feats, { feat: "feat.warrior.tough-as-nails" }, { feat: "feat.universal.focused-learner" }] });
    assert.ok(codes(b).includes("feat.count"));
    const b2 = withLevel1({ feats: [brokk.levels[0].feats[0], { feat: "feat.warrior.tough-as-nails" }] });
    assert.ok(codes(b2).includes("feat.bonus"));
  });
  test("3 ranks i samme skill på ét level", () => {
    assert.ok(codes(withLevel1({ skillRanks: { "skill.armor-heavy": 3 as 2 } })).includes("skill.cap"));
  });
  test("for mange skill points", () => {
    const ranks = Object.fromEntries(rules.skills.slice(0, 12).map((s) => [s.id, 2 as const]));
    assert.ok(codes(withLevel1({ skillRanks: ranks })).includes("skill.points"));
  });
  test("ikke standard array", () => {
    assert.ok(codes({ ...brokk, baseAttributes: { ...brokk.baseAttributes, STR: 18 } }).includes("attr.array"));
  });
  test("Human skal vælge +2 eller +1/+1", () => {
    assert.ok(codes({ ...ilsa, ancestryChoices: { attributeBoost: { INT: 1 } } }).includes("ancestry.boost"));
    assert.deepEqual(codes({ ...ilsa, ancestryChoices: { attributeBoost: { INT: 1, WIS: 1 } } }).filter((c) => c.startsWith("ancestry")), []);
  });
  test("level 5 kræver to forskellige attributpoint", () => {
    const b = { ...ilsa, levels: ilsa.levels.map((l, i) => i === 4 ? { ...l, attributeIncreases: ["INT", "INT"] as ["INT", "INT"] } : l) };
    assert.ok(codes(b).includes("level.attr.same"));
  });
  test("background-slot skal udfyldes med den rigtige slags skill", () => {
    assert.ok(codes({ ...brokk, backgroundSlots: { weapon: ["skill.armor-heavy"], armor: ["skill.armor-heavy"] } }).includes("background.slot.kind"));
  });
});

// ---------------------------------------------------------------------------------------------
// Stablingsregler og rank-bonus
// ---------------------------------------------------------------------------------------------
describe("modifiers og ranks", () => {
  const mod = (type: "item" | "magical" | "condition", v: number, source = type): SourcedModifier =>
    ({ modifier: { target: { kind: "stat", stat: "DFR" }, value: v, type, applies: "always" }, source });

  test("item-bonusser stabler ikke – højeste tæller", () =>
    assert.equal(stack([mod("item", 4), mod("item", 2)], ["stat:DFR"]).add, 4));
  test("item + magical + condition stabler med hinanden", () =>
    assert.equal(stack([mod("item", 4), mod("magical", 1), mod("condition", 2), mod("condition", 1)], ["stat:DFR"]).add, 8));
  test("straffe stabler altid (K9)", () =>
    assert.equal(stack([mod("item", -4), mod("item", -2), mod("item", 3)], ["stat:DFR"]).add, -3));
  test("rank-bonus med aftagende udbytte", () => {
    const got = [0, 1, 10, 11, 12, 30, 31, 34, 35].map((r) => rankBonus(r, rules));
    assert.deepEqual(got, [0, 1, 10, 10, 11, 20, 20, 21, 21]);
  });
  test("Treegon: DEX-loft 3 og barkhud +4 item-DFR", () => {
    const t: CharacterBuild = { ...brokk, ancestry: "ancestry.treegon",
      baseAttributes: { STR: 10, CON: 10, DEX: 18, INT: 10, WIS: 10, CHA: 10 }, attributeMethod: "rolled" };
    const s = computeSheet(t, [], rules, ix);
    // 8 + min(DEX 4, loft 3) + Armor: Light 0 + item 4 = 15
    assert.equal(s.dfr.total, 15);
  });
});

// ---------------------------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------------------------
import { spellGroups, spellLines } from "../src/engine/spells.ts";

describe("spells", () => {
  const sp = (domain: string, level: number) => rules.spells.filter((s) => s.domain === domain && s.level <= level && s.level > level - 5);
  const fire = sp("domain.fire", 5).map((s) => s.id);
  const earth = sp("domain.earth", 5).map((s) => s.id);
  const fire2 = sp("domain.fire", 10).map((s) => s.id);
  // Ilsa har Magic study I (level 1) og II (level 2): Elementalism
  const withSpells = (ids: string[], source: "start" | "learned" = "start"): CharacterBuild =>
    ({ ...ilsa, spells: ids.map((spell) => ({ spell, source })) });
  const sheet = computeSheet(ilsa, [], rules, ix);

  test("adgang: Elementalism tier 2 (level 1-10), kun tier 1 ved level 1", () => {
    const [g] = spellGroups(ilsa, sheet, rules, ix);
    assert.equal(g.id, "realm.elementalism"); assert.equal(g.maxLevel, 10); assert.equal(g.tierAtLevel1, 1);
    assert.deepEqual(g.domains, ["domain.fire", "domain.earth", "domain.air", "domain.water"]);
  });
  test("memoriseringsgrænse = 5 + INT 4 + ½ level (5) = 11; cantrip rank = Elementalism-skill 14", () => {
    const [g] = spellGroups(ilsa, sheet, rules, ix);
    assert.equal(g.memorizedLimit, 11); assert.equal(g.cantripRank, 14);
  });
  test("3 startspells på tværs af domæner i realmet er gyldigt (K11)", () => {
    const codes = errors(withSpells([fire[0], fire[1], earth[0]])).map((i) => i.code);
    assert.deepEqual(codes.filter((c) => c.startsWith("spell")), []);
  });
  test("4 startspells i samme tier er for mange", () => {
    assert.ok(errors(withSpells([fire[0], fire[1], fire[2], earth[0]])).some((i) => i.code === "spell.start.count"));
  });
  test("tier 2-spells kan ikke vælges som startspells (Study II blev taget på level 2)", () => {
    assert.ok(errors(withSpells([fire2[0]])).some((i) => i.code === "spell.start.count"));
  });
  test("lærte spells inden for adgang er altid gyldige; uden for adgang er de ikke", () => {
    assert.deepEqual(errors(withSpells([fire2[0], fire2[1], fire2[2], fire2[3]], "learned")).filter((i) => i.code.startsWith("spell")), []);
    const warding = rules.spells.find((s) => s.domain === "domain.warding")!.id;
    assert.ok(errors(withSpells([warding], "learned")).some((i) => i.code === "spell.access"));
  });
  test("spell-linjer: MP-pris = level, cantrip når level ≤ cantrip rank", () => {
    const b = withSpells([fire[0]]);
    const s = computeSheet(b, [], rules, ix);
    const [line] = spellLines(b, { memorizedSpells: [fire[0]] } as any, spellGroups(b, s, rules, ix), ix);
    assert.equal(line.mpCost, line.spell.level); assert.equal(line.cantrip, true); assert.equal(line.memorized, true);
  });
});
