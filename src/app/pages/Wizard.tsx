/**
 * Guiden: opretter en ny karakter (mode "create") eller tager et nyt level (mode "levelup").
 * Alt regnes live af regelmotoren; problemer vises ved det trin, de hører til.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Ancestry, Armor, Attribute, Background, Feat, Save, Skill, Weapon } from "../../rules/types.ts";
import type { CharacterBuild, FeatPick, InventoryItem, LevelChoices } from "../../character/types.ts";
import { ATTRIBUTES, attributeModifier, computeSheet, rankBonus, SAVES, type Sheet } from "../../engine/compute.ts";
import { featAvailability, validateBuild, type Issue } from "../../engine/validate.ts";
import { useRules } from "../lib/rules.tsx";
import { repo } from "../lib/repo.ts";
import { actionLabel, ATTRIBUTE_NAMES, emptyLevel, initialPlay, newBuild, priceLabel, signed } from "../lib/character.ts";

type StepId = "ancestry" | "attributes" | "background" | "gains" | "feats" | "skills" | "saves" | "gear" | "review";
const STEP_LABEL: Record<StepId, string> = {
  ancestry: "Ancestry", attributes: "Attributes", background: "Background", gains: "Level gains",
  feats: "Feats", skills: "Skills", saves: "Saves", gear: "Gear", review: "Review",
};
const STEP_FOR_ISSUE: [RegExp, StepId][] = [
  [/^ancestry/, "ancestry"], [/^attr/, "attributes"], [/^background/, "background"],
  [/^level\.(attr|bpmp)/, "gains"], [/^feat/, "feats"], [/^skill/, "skills"], [/^level\.saves/, "saves"],
];
const stepOf = (i: Issue): StepId => STEP_FOR_ISSUE.find(([re]) => re.test(i.code))?.[1] ?? "review";

export function Wizard({ mode }: { mode: "create" | "levelup" }) {
  const { rules, ix } = useRules();
  const { id } = useParams();
  const navigate = useNavigate();
  const [build, setBuild] = useState<CharacterBuild | null>(mode === "create" ? newBuild() : null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [step, setStep] = useState<StepId>(mode === "create" ? "ancestry" : "gains");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  useEffect(() => {
    if (mode !== "levelup" || !id) return;
    repo.get(id).then((c) => {
      if (!c) return;
      setInventory(c.inventory);
      setBuild({ ...c.build, levels: [...c.build.levels, emptyLevel()] });
    });
  }, [mode, id]);

  const sheet = useMemo(() => build && computeSheet(build, inventory, rules, ix), [build, inventory, rules, ix]);
  const issues = useMemo(() => build && sheet ? validateBuild(build, inventory, rules, ix, sheet) : [], [build, inventory, rules, ix, sheet]);
  if (!build || !sheet) return <main className="shell"><p className="section">Loading…</p></main>;

  const level = build.levels.length;
  const row = rules.progression.levels.find((l) => l.level === level);
  const steps: StepId[] = mode === "create"
    ? ["ancestry", "attributes", "background", "feats", "skills", "saves", "gear", "review"]
    : [...(row?.attributePoints || row?.bpOrMp ? ["gains" as const] : []), "feats", "skills",
       ...(row?.saveProficiencyPoints ? ["saves" as const] : []), "review"];
  const current = steps.includes(step) ? step : steps[0];
  const idx = steps.indexOf(current);
  const stepIssues = (s: StepId) => issues.filter((i) => stepOf(i) === s);
  const errors = issues.filter((i) => i.severity === "error");

  const update = (fn: (b: CharacterBuild) => CharacterBuild) => setBuild((b) => (b ? fn(b) : b));
  const updateLevel = (fn: (l: LevelChoices) => LevelChoices) =>
    update((b) => ({ ...b, levels: b.levels.map((l, i) => (i === b.levels.length - 1 ? fn(l) : l)) }));

  async function save() {
    if (!build || !sheet) return;
    setSaving(true); setSaveError(null);
    try {
      if (mode === "create") {
        const newId = await repo.create(build, inventory, initialPlay(sheet));
        navigate(`/c/${newId}`, { replace: true });
      } else {
        await repo.saveBuild(id!, build);
        navigate(`/c/${id}`, { replace: true });
      }
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  }

  const props: StepProps = { build, sheet, update, updateLevel, mode };
  return (
    <main className="shell">
      <div className="section">
        <h1>{mode === "create" ? "New character" : `${build.name}: level ${level}`}</h1>
        <ol className="steps" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s}>
              <button onClick={() => setStep(s)} aria-current={s === current ? "step" : undefined}
                ref={s === current ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined}
                className={i < idx && !stepIssues(s).some((x) => x.severity === "error") ? "done" : ""}>
                {i + 1}. {STEP_LABEL[s]}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {current === "ancestry" && <AncestryStep {...props} />}
      {current === "attributes" && <AttributesStep {...props} />}
      {current === "background" && <BackgroundStep {...props} />}
      {current === "gains" && <GainsStep {...props} />}
      {current === "feats" && <FeatsStep {...props} />}
      {current === "skills" && <SkillsStep {...props} />}
      {current === "saves" && <SavesStep {...props} />}
      {current === "gear" && <GearStep inventory={inventory} setInventory={setInventory} sheet={sheet} />}
      {current === "review" && <ReviewStep {...props} issues={issues} />}

      {current !== "review" && stepIssues(current).length > 0 && (
        <div className="section"><IssueList issues={stepIssues(current)} /></div>
      )}
      {saveError && <p style={{ color: "var(--bad)" }}>Could not save: {saveError}</p>}

      <nav className="wizard-nav">
        <div className="inner">
          <button className="btn quiet" onClick={() => idx > 0 ? setStep(steps[idx - 1]) : navigate(-1)}>
            {idx > 0 ? "Back" : "Cancel"}
          </button>
          {current === "review" ? (
            <button className="btn" disabled={errors.length > 0 || saving || !build.name.trim()} onClick={save}>
              {saving ? "Saving…" : mode === "create" ? "Create character" : `Save level ${level}`}
            </button>
          ) : (
            <button className="btn" onClick={() => setStep(steps[idx + 1])}>Next: {STEP_LABEL[steps[idx + 1]]}</button>
          )}
        </div>
      </nav>
    </main>
  );
}

interface StepProps {
  build: CharacterBuild;
  sheet: Sheet;
  mode: "create" | "levelup";
  update: (fn: (b: CharacterBuild) => CharacterBuild) => void;
  updateLevel: (fn: (l: LevelChoices) => LevelChoices) => void;
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return <ul className="issues">{issues.map((i, n) => <li key={n} className={i.severity}>{i.message}</li>)}</ul>;
}

function Clarifications({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return <>{items.map((c, i) => <p key={i} className="clarification">{c}</p>)}</>;
}

// ---------------------------------------------------------------------------------------------
function AncestryStep({ build, update }: StepProps) {
  const { rules } = useRules();
  const anc = rules.ancestries.find((a) => a.id === build.ancestry);
  const hasBoost = anc?.choices.some((c) => c.from.kind === "attributeBoost");
  const boost = build.ancestryChoices.attributeBoost ?? {};
  const boostMode = Object.values(boost).some((v) => v === 2) ? "two" : Object.keys(boost).length ? "ones" : "two";
  const setBoost = (b: Partial<Record<Attribute, number>>) => update((x) => ({ ...x, ancestryChoices: { attributeBoost: b } }));
  const ones = Object.keys(boost) as Attribute[];

  return (
    <section className="grid">
      <h2>Choose an ancestry</h2>
      <div className="grid two">
        {rules.ancestries.map((a: Ancestry) => (
          <button key={a.id} className="choice" aria-pressed={a.id === build.ancestry}
            onClick={() => update((x) => ({ ...x, ancestry: a.id, ancestryChoices: {} }))}>
            <h3>{a.name}</h3>
            <p className="small muted" style={{ marginTop: "0.35rem" }}>{a.text}</p>
            <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {a.traits.map((t) => <li key={t.name}><b>{t.name}.</b> {t.text}</li>)}
            </ul>
            {a.restrictions?.map((r) => <p key={r} className="small" style={{ color: "var(--warn)", margin: "0.4rem 0 0" }}>{r}</p>)}
          </button>
        ))}
      </div>
      {anc && <Clarifications items={anc.clarifications} />}
      {hasBoost && (
        <div className="panel grid">
          <h3>{anc!.name}: attribute bonus</h3>
          <div className="row">
            <button className="btn small quiet" aria-pressed={boostMode === "two"} onClick={() => setBoost({})}>+2 to one</button>
            <button className="btn small quiet" aria-pressed={boostMode === "ones"} onClick={() => setBoost({ STR: 1, CON: 1 })}>+1 to two</button>
          </div>
          {boostMode === "two" ? (
            <select value={Object.keys(boost)[0] ?? ""} onChange={(e) => setBoost(e.target.value ? { [e.target.value]: 2 } : {})}>
              <option value="">Choose attribute…</option>
              {ATTRIBUTES.map((a) => <option key={a} value={a}>{ATTRIBUTE_NAMES[a]} +2</option>)}
            </select>
          ) : (
            <div className="row">
              {[0, 1].map((n) => (
                <select key={n} style={{ flex: 1 }} value={ones[n] ?? ""} onChange={(e) => {
                  const next = [...ones]; next[n] = e.target.value as Attribute;
                  setBoost(Object.fromEntries(next.filter(Boolean).map((a) => [a, 1])));
                }}>
                  {ATTRIBUTES.map((a) => <option key={a} value={a}>{ATTRIBUTE_NAMES[a]} +1</option>)}
                </select>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
function AttributesStep({ build, sheet, update }: StepProps) {
  const { rules } = useRules();
  const array = rules.progression.standardArray;
  const used = ATTRIBUTES.map((a) => build.baseAttributes[a]);
  const setAttr = (a: Attribute, v: number) => update((b) => ({ ...b, baseAttributes: { ...b.baseAttributes, [a]: v } }));
  const setMethod = (m: CharacterBuild["attributeMethod"]) => update((b) => ({
    ...b, attributeMethod: m,
    baseAttributes: m === "standardArray"
      ? { STR: array[0], CON: array[1], DEX: array[2], INT: array[3], WIS: array[4], CHA: array[5] }
      : b.baseAttributes,
  }));
  useEffect(() => {
    if (build.attributeMethod === "standardArray" && !array.every((v) => used.includes(v))) setMethod("standardArray");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="grid">
      <h2>Attributes</h2>
      <div className="row">
        <button className="btn small quiet" aria-pressed={build.attributeMethod === "standardArray"} onClick={() => setMethod("standardArray")}>Standard array ({array.join(", ")})</button>
        <button className="btn small quiet" aria-pressed={build.attributeMethod === "rolled"} onClick={() => setMethod("rolled")}>Rolled (4d6, drop lowest)</button>
      </div>
      <p className="small muted">{build.attributeMethod === "standardArray"
        ? "Swap values between attributes. Each value from the array is used once."
        : "Enter the six results you rolled, in the attributes you want them."}</p>
      <div className="grid two">
        {ATTRIBUTES.map((a) => {
          const final = sheet.attributes[a].score.total;
          const diff = final - build.baseAttributes[a];
          return (
            <div key={a} className="panel spread">
              <div>
                <h3>{ATTRIBUTE_NAMES[a]}</h3>
                <div className="small muted">{diff ? `${build.baseAttributes[a]} ${signed(diff)} ancestry = ${final}` : `Score ${final}`}, modifier {signed(attributeModifier(final))}</div>
              </div>
              {build.attributeMethod === "standardArray" ? (
                <select style={{ width: "5rem" }} value={build.baseAttributes[a]} onChange={(e) => {
                  const v = Number(e.target.value);
                  const other = ATTRIBUTES.find((x) => x !== a && build.baseAttributes[x] === v);
                  update((b) => ({ ...b, baseAttributes: { ...b.baseAttributes, [a]: v, ...(other ? { [other]: b.baseAttributes[a] } : {}) } }));
                }}>
                  {array.map((v, i) => <option key={i} value={v}>{v}</option>)}
                </select>
              ) : (
                <input type="number" min={3} max={18} style={{ width: "5rem" }} value={build.baseAttributes[a]}
                  onChange={(e) => setAttr(a, Number(e.target.value))} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
function BackgroundStep({ build, update }: StepProps) {
  const { rules, ix } = useRules();
  const bg = rules.backgrounds.find((b) => b.id === build.background);
  const combat = rules.skills.filter((s) => s.category.startsWith("combat"));
  const armor = rules.skills.filter((s) => s.category === "armor");
  const rankLabel = (r: Background["skillRanks"][number]) =>
    typeof r.skill === "string" ? (ix.skill(r.skill)?.name ?? r.skill) : `${r.skill.slot === "weapon" ? "Weapon" : "Armor"} #${r.skill.index}`;

  return (
    <section className="grid">
      <h2>Choose a background</h2>
      <div className="grid two">
        {rules.backgrounds.map((b) => (
          <button key={b.id} className="choice" aria-pressed={b.id === build.background}
            onClick={() => update((x) => ({ ...x, background: b.id, backgroundSlots: {} }))}>
            <h3>{b.name}</h3>
            <p className="small muted" style={{ marginTop: "0.35rem" }}>{b.text}</p>
            <p className="small" style={{ margin: 0 }}>
              <b>{b.benefit.kind === "feat" ? `Free feat: ${ix.feat(b.benefit.feat)?.name}` : b.benefit.kind === "socialStanding" ? `Social standing ${b.benefit.min}+` : b.benefit.text}</b>
            </p>
            <p className="small muted" style={{ margin: 0 }}>{b.skillRanks.map((r) => `${rankLabel(r)} (${r.ranks})`).join(", ")}</p>
          </button>
        ))}
      </div>
      {bg && bg.skillRanks.some((r) => typeof r.skill !== "string") && (
        <div className="panel grid">
          <h3>{bg.name}: choose your training</h3>
          {bg.skillRanks.filter((r) => typeof r.skill !== "string").map((r) => {
            const slot = r.skill as { slot: "weapon" | "armor"; index: number };
            const options = slot.slot === "weapon" ? combat : armor;
            const value = build.backgroundSlots[slot.slot]?.[slot.index - 1] ?? "";
            return (
              <label key={`${slot.slot}${slot.index}`} className="field">
                {slot.slot === "weapon" ? "Weapon" : "Armor"} #{slot.index} ({r.ranks} ranks)
                <select value={value} onChange={(e) => update((b) => {
                  const list = [...(b.backgroundSlots[slot.slot] ?? [])];
                  list[slot.index - 1] = e.target.value;
                  return { ...b, backgroundSlots: { ...b.backgroundSlots, [slot.slot]: list } };
                })}>
                  <option value="">Choose…</option>
                  {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
function GainsStep({ build, updateLevel }: StepProps) {
  const { rules } = useRules();
  const level = build.levels.length;
  const row = rules.progression.levels.find((l) => l.level === level);
  const lvl = build.levels[level - 1];
  return (
    <section className="grid">
      <h2>Level {level} gains</h2>
      {row?.attributePoints && (
        <div className="panel grid">
          <h3>+1 to two different attributes</h3>
          <div className="row">
            {[0, 1].map((n) => (
              <select key={n} style={{ flex: 1 }} value={lvl.attributeIncreases?.[n] ?? ""} onChange={(e) => updateLevel((l) => {
                const cur = [...(l.attributeIncreases ?? ["", ""])] as string[];
                cur[n] = e.target.value;
                return { ...l, attributeIncreases: cur.every(Boolean) ? (cur as [Attribute, Attribute]) : (cur as unknown as [Attribute, Attribute]) };
              })}>
                <option value="">Choose…</option>
                {ATTRIBUTES.map((a) => <option key={a} value={a}>{ATTRIBUTE_NAMES[a]}</option>)}
              </select>
            ))}
          </div>
        </div>
      )}
      {row?.bpOrMp && (
        <div className="panel grid">
          <h3>+{row.bpOrMp} to Body Points or Mind Points</h3>
          <div className="row">
            {(["BP", "MP"] as const).map((k) => (
              <button key={k} className="btn quiet" aria-pressed={lvl.bpOrMp === k} onClick={() => updateLevel((l) => ({ ...l, bpOrMp: k }))}>+{row.bpOrMp} {k}</button>
            ))}
          </div>
        </div>
      )}
      {!row?.attributePoints && !row?.bpOrMp && <p className="muted">No attribute or BP/MP gains at this level.</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
function FeatsStep({ build, sheet, updateLevel }: StepProps) {
  const { rules, ix } = useRules();
  const level = build.levels.length;
  const lvl = build.levels[level - 1];
  const groups = [...rules.archetypes.map((a) => ({ id: a.id, name: a.name })),
    ...rules.ancestries.filter((a) => a.id === build.ancestry).map((a) => ({ id: a.id, name: `${a.name} (ancestry)` }))];
  const [group, setGroup] = useState(groups[0].id);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const row = rules.progression.levels.find((l) => l.level === level);
  const newRegular = level === 1 ? rules.progression.startingFeats : (row?.feats ?? 0);
  const allPicks = build.levels.flatMap((l) => l.feats).map((p) => ix.feat(p.feat)).filter(Boolean) as Feat[];
  const regularTotal = allPicks.filter((f) => !f.isBonus).length;
  const bonusTotal = allPicks.filter((f) => f.isBonus).length;
  const pickedHere = lvl.feats.map((p) => ix.feat(p.feat)).filter(Boolean) as Feat[];
  const regularHere = pickedHere.filter((f) => !f.isBonus).length;
  const bonusOpen = Math.floor(regularTotal / 3) - bonusTotal;

  const isPicked = (f: Feat) => lvl.feats.some((p) => p.feat === f.id);
  const toggle = (f: Feat) => updateLevel((l) => ({
    ...l, feats: isPicked(f) ? l.feats.filter((p) => p.feat !== f.id) : [...l.feats, { feat: f.id }],
  }));
  const setChoice = (f: Feat, key: string, v: string) => updateLevel((l) => ({
    ...l, feats: l.feats.map((p): FeatPick => (p.feat === f.id ? { ...p, choices: { ...p.choices, [key]: v } } : p)),
  }));

  const q = query.trim().toLowerCase();
  const list = rules.feats.filter((f) => (q ? f.name.toLowerCase().includes(q) || f.text.toLowerCase().includes(q) : f.group === group));

  return (
    <section className="grid">
      <div className="spread">
        <h2>Feats</h2>
        <div className="small" style={{ textAlign: "right" }}>
          <div><span className={`counter ${regularHere > newRegular ? "over" : ""}`}>{regularHere}/{newRegular}</span> chosen at this level</div>
          {bonusOpen > 0 && <div className="muted">{bonusOpen} bonus feat{bonusOpen > 1 ? "s" : ""} unlocked</div>}
        </div>
      </div>
      {sheet.backgroundFeat && level === 1 && <p className="small muted">From your background you also get <b>{sheet.backgroundFeat.name}</b>.</p>}
      <input type="search" placeholder="Search all feats" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!q && (
        <div className="row">
          {groups.map((g) => <button key={g.id} className="btn small quiet" aria-pressed={g.id === group} onClick={() => setGroup(g.id)}>{g.name}</button>)}
        </div>
      )}
      <label className="row small"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show feats I can't take yet</label>
      <ul className="list panel" style={{ padding: "0 1rem" }}>
        {list.map((f) => {
          const avail = featAvailability(f, build, sheet, ix);
          const picked = isPicked(f);
          if (!picked && !avail.ok && !showAll) return null;
          const pick = lvl.feats.find((p) => p.feat === f.id);
          return (
            <li key={f.id}>
              <div className="spread">
                <div>
                  <h3 style={{ fontSize: "var(--step-0)" }}>{f.name} <span className="muted">{actionLabel(f.action)}</span></h3>
                  <div className="row small">
                    {f.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                    {f.cost?.bp && <span className="tag" style={{ color: "var(--blood)" }}>{f.cost.bp}{f.cost.variable ? "*" : ""} BP</span>}
                    {f.cost?.mp && <span className="tag" style={{ color: "var(--mind)" }}>{f.cost.mp}{f.cost.variable ? "*" : ""} MP</span>}
                    {q && <span className="muted">{ix.get<{ name: string }>(f.group)?.name}</span>}
                  </div>
                </div>
                <button className={picked ? "btn small" : "btn small quiet"} disabled={!picked && !avail.ok} onClick={() => toggle(f)}>
                  {picked ? "Chosen" : "Choose"}
                </button>
              </div>
              <p className="small" style={{ margin: "0.4rem 0 0" }}>{f.text}</p>
              <p className="small muted" style={{ margin: 0 }}>Prerequisites: {f.prerequisitesText}</p>
              {!avail.ok && <p className="small" style={{ color: "var(--warn)", margin: 0 }}>{avail.reasons.join("; ")}</p>}
              {avail.unchecked.length > 0 && <p className="small muted" style={{ margin: 0 }}>Check yourself: {avail.unchecked.join("; ")}</p>}
              <Clarifications items={f.clarifications} />
              {picked && f.choices.map((c) => (
                <label key={c.key} className="field small" style={{ marginTop: "0.4rem" }}>{c.prompt}
                  {c.from.kind === "weapon" ? (
                    <select value={pick?.choices?.[c.key] ?? ""} onChange={(e) => setChoice(f, c.key, e.target.value)}>
                      <option value="">Choose…</option>
                      {rules.weapons.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  ) : c.from.kind === "realm" ? (
                    <select value={pick?.choices?.[c.key] ?? ""} onChange={(e) => setChoice(f, c.key, e.target.value)}>
                      <option value="">Choose…</option>
                      {["elementalism", "spiritualism", "mysticism"].map((r) => <option key={r} value={`realm.${r}`}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={pick?.choices?.[c.key] ?? ""} onChange={(e) => setChoice(f, c.key, e.target.value)} />
                  )}
                </label>
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
function SkillsStep({ build, sheet, updateLevel }: StepProps) {
  const { rules } = useRules();
  const lvl = build.levels[build.levels.length - 1];
  const left = sheet.skillPoints.available - sheet.skillPoints.spent;
  const cats: [Skill["category"], string][] = [["general", "General"], ["combatMelee", "Melee weapons"],
    ["combatRanged", "Ranged weapons"], ["armor", "Armor"], ["magic", "Magic"]];
  const set = (id: string, n: number) => updateLevel((l) => {
    const r = { ...l.skillRanks };
    if (n === 0) delete r[id]; else r[id] = n as 1 | 2;
    return { ...l, skillRanks: r };
  });
  return (
    <section className="grid">
      <div className="spread">
        <h2>Skills</h2>
        <div className="small" style={{ textAlign: "right" }}>
          <span className={`counter ${left < 0 ? "over" : ""}`}>{left}</span> skill points left
          <div className="muted">1st rank costs 1, 2nd rank at the same level costs 2</div>
        </div>
      </div>
      {cats.map(([cat, label]) => (
        <div key={cat} className="panel">
          <h3>{label}</h3>
          <ul className="list">
            {sheet.skills.filter((s) => s.skill.category === cat).map((s) => {
              const here = lvl.skillRanks[s.skill.id] ?? 0;
              return (
                <li key={s.skill.id} className="skill-line">
                  <div>
                    {s.skill.name.replace(/^Combat: (Melee|Ranged) – /, "").replace(/^Armor: /, "")}
                    <span className="small muted"> {s.skill.attribute ?? ""}, {s.ranks} ranks (+{rankBonus(s.ranks, rules)})</span>
                  </div>
                  <div className="row" role="group" aria-label={`Ranks this level in ${s.skill.name}`}>
                    {[0, 1, 2].map((n) => (
                      <button key={n} className={here === n ? "btn small" : "btn small quiet"} onClick={() => set(s.skill.id, n)}>{n}</button>
                    ))}
                  </div>
                  <span className="total">{signed(s.value.total)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
function SavesStep({ build, sheet, updateLevel }: StepProps) {
  const { rules } = useRules();
  const level = build.levels.length;
  const lvl = build.levels[level - 1];
  const points = level === 1 ? rules.progression.startingSaveProficiencyPoints
    : (rules.progression.levels.find((l) => l.level === level)?.saveProficiencyPoints ?? 0);
  const used = SAVES.reduce((s, sv) => s + (lvl.saveProficiency[sv] ?? 0), 0);
  const set = (sv: Save, d: number) => updateLevel((l) => ({
    ...l, saveProficiency: { ...l.saveProficiency, [sv]: Math.max(0, (l.saveProficiency[sv] ?? 0) + d) },
  }));
  const names: Record<Save, string> = { fortitude: "Fortitude (STR + CON)", reaction: "Reaction (DEX + INT)", willpower: "Willpower (WIS + CHA)" };
  return (
    <section className="grid">
      <div className="spread">
        <h2>Saves</h2>
        <span className="small"><span className={`counter ${used > points ? "over" : ""}`}>{points - used}</span> points left</span>
      </div>
      {SAVES.map((sv) => (
        <div key={sv} className="panel spread">
          <div><h3>{names[sv]}</h3><div className="small muted">{lvl.saveProficiency[sv] ?? 0} points at this level</div></div>
          <div className="row">
            <button className="icon-btn" aria-label={`Remove point from ${sv}`} onClick={() => set(sv, -1)}>−</button>
            <span className="counter" style={{ minWidth: "2.5rem", textAlign: "center" }}>{signed(sheet.saves[sv].total)}</span>
            <button className="icon-btn" aria-label={`Add point to ${sv}`} disabled={used >= points} onClick={() => set(sv, 1)}>+</button>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
function GearStep({ inventory, setInventory, sheet }: { inventory: InventoryItem[]; setInventory: (i: InventoryItem[]) => void; sheet: Sheet }) {
  const { rules, ix } = useRules();
  const add = (ref: string, equipped: boolean) =>
    setInventory([...inventory, { instanceId: crypto.randomUUID(), ref, quantity: 1, equipped }]);
  return (
    <section className="grid">
      <h2>Starting gear</h2>
      <p className="muted">You start with a weapon of your choice and the lowest-tier armor from the armor group you are trained in. You can add more gear and loot on your sheet later.</p>
      <div className="panel">
        <h3>Your gear</h3>
        {inventory.length === 0 && <p className="small muted" style={{ marginTop: "0.4rem" }}>Nothing yet. Add items below.</p>}
        <ul className="list">
          {inventory.map((i) => (
            <li key={i.instanceId} className="spread">
              <span>{ix.get<{ name: string }>(i.ref!)?.name}{i.equipped ? <span className="small muted">, worn</span> : null}</span>
              <button className="btn small quiet" onClick={() => setInventory(inventory.filter((x) => x.instanceId !== i.instanceId))}>Remove</button>
            </li>
          ))}
        </ul>
        <p className="small muted" style={{ margin: 0 }}>Carry {sheet.carry.total}, load {sheet.enc}{sheet.overload ? `, overloaded by ${sheet.overload}` : ""}</p>
      </div>
      <div className="grid two">
        <div className="panel">
          <h3>Weapons</h3>
          <ul className="list">
            {rules.weapons.map((w: Weapon) => (
              <li key={w.id} className="spread small">
                <span><b>{w.name}</b> <span className="muted">DMG {w.dmg ?? "*"}, ENC {w.enc ?? 0}, {priceLabel(w.price)}</span></span>
                <button className="btn small quiet" onClick={() => add(w.id, true)}>Add</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h3>Armor and shields</h3>
          <ul className="list">
            {rules.armor.map((a: Armor) => (
              <li key={a.id} className="spread small">
                <span><b>{a.name}</b> <span className="muted">{a.armorClass}, DFR {signed(a.dfr)}, TOU {signed(a.tou)}, ENC {a.enc}</span></span>
                <button className="btn small quiet" onClick={() => add(a.id, true)}>Add</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
function ReviewStep({ build, sheet, update, issues, mode }: StepProps & { issues: Issue[] }) {
  const stones: [string, number][] = [["BP", sheet.bp.total], ["MP", sheet.mp.total], ["DFR", sheet.dfr.total],
    ["TOU", sheet.tou.total], ["SPD", sheet.spd.total], ["HDC", sheet.hdc.total]];
  return (
    <section className="grid">
      <h2>Review</h2>
      {mode === "create" && (
        <label className="field">Character name
          <input type="text" value={build.name} placeholder="Name your hero" onChange={(e) => update((b) => ({ ...b, name: e.target.value }))} />
        </label>
      )}
      <div className="stones">
        {stones.map(([k, v]) => <div key={k} className="stone"><span className="v">{v}</span><span className="k">{k}</span></div>)}
      </div>
      {issues.length === 0 ? <p className="muted">Everything checks out.</p> : (
        <div className="panel"><h3>Before you save</h3><div style={{ marginTop: "0.5rem" }}><IssueList issues={issues} /></div></div>
      )}
      {mode === "create" && !build.name.trim() && <p className="small muted">Give your character a name to save.</p>}
    </section>
  );
}
