/**
 * Indsamling og stabling af modifiers (bogen s. 12 + konflikt K9/K10).
 *
 * - condition og score: alle lægges sammen
 * - item og magical: kun den højeste bonus af hver type tæller; straffe (negative) lægges altid sammen
 * - operation "cap": laveste loft vinder
 * - applies "situational": tælles ikke med, men vises
 */
import type { Modifier, ModifierTarget } from "../rules/types.ts";

/** Et bidrag til en værdi på arket, med kilde – det appen viser, når man trykker på en værdi. */
export interface Part {
  label: string;
  value: number;
  /** Hvor bidraget kommer fra, fx "Feat: Thick skinned". */
  source?: string;
  type?: Modifier["type"] | "base";
  /** false = vises, men tæller ikke (situational eller overgået af en større item-bonus). */
  counted: boolean;
  note?: string;
}

export interface Value {
  total: number;
  parts: Part[];
}

/** En modifier med kilde, klar til at blive matchet mod en værdi. */
export interface SourcedModifier {
  modifier: Modifier;
  source: string;
  /** Konkret skill-ID, når target var "$choice.x" og er slået op. */
  resolvedSkill?: string;
}

export function targetKey(t: ModifierTarget, resolvedSkill?: string): string {
  switch (t.kind) {
    case "attribute": return `attr:${t.attribute}`;
    case "save": return `save:${t.save}`;
    case "skill": return `skill:${resolvedSkill ?? t.skill}`;
    case "stat": return `stat:${t.stat}`;
  }
}

/** Matcher en nøgle mod et mønster: "skill:all", "skill:skill.combat-melee-*" osv. */
export function keyMatches(pattern: string, key: string): boolean {
  if (pattern === key) return true;
  const [pk, pv] = splitKey(pattern);
  const [kk] = splitKey(key);
  if (pk !== kk) return false;
  if (pv === "all") return true;
  if (pv.includes("*")) {
    const re = new RegExp("^" + pv.split("*").map(escapeRe).join(".*") + "$");
    return re.test(splitKey(key)[1]);
  }
  return false;
}

function splitKey(k: string): [string, string] {
  const i = k.indexOf(":");
  return [k.slice(0, i), k.slice(i + 1)];
}
const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/**
 * Anvend stablingsreglerne på alle modifiers, der rammer en af `keys`.
 * Returnerer summen af det, der tæller, og alle dele til visning.
 */
export function stack(mods: SourcedModifier[], keys: string[]): { add: number; cap: number | null; parts: Part[] } {
  // Alle nøgler stables samlet, så fx en item-bonus på "alle saves" og én på Fortitude ikke begge tæller.
  const relevant = mods.filter((m) => {
    const k = targetKey(m.modifier.target, m.resolvedSkill);
    return keys.some((key) => keyMatches(k, key));
  });
  const parts: Part[] = [];
  let add = 0;
  let cap: number | null = null;

  const always = relevant.filter((m) => m.modifier.applies === "always");
  for (const m of relevant.filter((m) => m.modifier.applies === "situational")) {
    parts.push(part(m, false, m.modifier.condition));
  }

  for (const m of always.filter((m) => m.modifier.operation === "cap")) {
    cap = cap === null ? m.modifier.value : Math.min(cap, m.modifier.value);
    parts.push(part(m, true, `cap: at most ${m.modifier.value}`));
  }

  const adds = always.filter((m) => m.modifier.operation !== "cap");
  for (const type of ["score", "condition", "item", "magical"] as const) {
    const ofType = adds.filter((m) => m.modifier.type === type);
    if (type === "score" || type === "condition") {
      for (const m of ofType) { add += m.modifier.value; parts.push(part(m, true)); }
      continue;
    }
    // item / magical: straffe stabler, bonusser gør ikke (kun den højeste tæller)
    const penalties = ofType.filter((m) => m.modifier.value < 0);
    const bonuses = ofType.filter((m) => m.modifier.value > 0).sort((a, b) => b.modifier.value - a.modifier.value);
    for (const m of penalties) { add += m.modifier.value; parts.push(part(m, true)); }
    bonuses.forEach((m, i) => {
      if (i === 0) add += m.modifier.value;
      parts.push(part(m, i === 0, i === 0 ? undefined : `does not stack with a larger ${type} bonus`));
    });
  }
  return { add, cap, parts };
}

function part(m: SourcedModifier, counted: boolean, note?: string): Part {
  return { label: m.source, value: m.modifier.value, source: m.source, type: m.modifier.type, counted, note };
}

/** Byg en værdi: faste basisdele + modifiers. */
export function value(base: Part[], mods: SourcedModifier[], ...keys: string[]): Value {
  const s = stack(mods, keys);
  const total = base.filter((p) => p.counted).reduce((sum, p) => sum + p.value, 0) + s.add;
  return { total, parts: [...base, ...s.parts] };
}

export const basePart = (label: string, v: number, note?: string): Part =>
  ({ label, value: v, type: "base", counted: true, note });
