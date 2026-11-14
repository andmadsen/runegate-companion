/**
 * Character sheet: beregnes live af regelmotoren. Tryk på en værdi for at se, hvor den kommer fra.
 * Tilstand under spil (BP/MP, wounds, conditions, penge) gemmes automatisk.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Character, InventoryItem, PlayState } from "../../character/types.ts";
import type { Armor, Currency, Feat, Modifier, Weapon } from "../../rules/types.ts";
import { ATTRIBUTES, computeSheet, SAVES } from "../../engine/compute.ts";
import { validateBuild } from "../../engine/validate.ts";
import type { Value } from "../../engine/modifiers.ts";
import { useRules } from "../lib/rules.tsx";
import { repo } from "../lib/repo.ts";
import { actionLabel, ATTRIBUTE_NAMES, idLabel, priceLabel, signed } from "../lib/character.ts";
import { BottomSheet, BreakdownTable } from "../components/Breakdown.tsx";
import { DomainFilter, SpellCard } from "../components/Spells.tsx";
import { groupForSpell, spellGroups, spellLines } from "../../engine/spells.ts";
import type { CharacterBuild } from "../../character/types.ts";
import { IssueList } from "./Wizard.tsx";

export function SheetPage() {
  const { id } = useParams();
  const { rules, ix } = useRules();
  const navigate = useNavigate();
  const [char, setChar] = useState<Character | null>(null);
  const [missing, setMissing] = useState(false);
  const [explain, setExplain] = useState<{ title: string; value: Value } | null>(null);
  const [tab, setTab] = useState<"sheet" | "skills" | "spells" | "feats" | "gear">("sheet");
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => { repo.get(id!).then((c) => (c ? setChar(c) : setMissing(true))); }, [id]);
  const sheet = useMemo(() => char && computeSheet(char.build, char.inventory, rules, ix), [char, rules, ix]);

  // Tilstand under spil gemmes kort efter sidste ændring – og altid med det samme,
  // når siden skjules eller lukkes (fx når telefonen låses ved bordet).
  const pending = useRef<{ id: string; play: PlayState } | null>(null);
  const flush = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    if (pending.current) { repo.savePlay(pending.current.id, pending.current.play); pending.current = null; }
  }, []);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { flush(); window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onHide); };
  }, [flush]);
  const setPlay = useCallback((fn: (p: PlayState) => PlayState) => {
    setChar((c) => {
      if (!c) return c;
      const play = fn(c.play);
      pending.current = { id: c.id, play };
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flush, 500);
      return { ...c, play };
    });
  }, [flush]);
  const saveItem = (item: InventoryItem) => {
    setChar((c) => c && ({ ...c, inventory: c.inventory.some((i) => i.instanceId === item.instanceId)
      ? c.inventory.map((i) => (i.instanceId === item.instanceId ? item : i)) : [...c.inventory, item] }));
    repo.saveItem(char!.id, item);
  };
  const saveBuild = (fn: (b: CharacterBuild) => CharacterBuild) => {
    setChar((c) => {
      if (!c) return c;
      const build = fn(c.build);
      repo.saveBuild(c.id, build);
      return { ...c, build };
    });
  };
  const deleteItem = (item: InventoryItem) => {
    setChar((c) => c && ({ ...c, inventory: c.inventory.filter((i) => i.instanceId !== item.instanceId) }));
    repo.deleteItem(char!.id, item.instanceId);
  };

  if (missing) return <main className="shell"><p className="section">This character no longer exists. <Link to="/">Back to characters</Link></p></main>;
  if (!char || !sheet) return <main className="shell"><p className="section">Loading…</p></main>;

  const { build, play } = char;
  const anc = ix.get<{ name: string }>(build.ancestry)?.name ?? idLabel(build.ancestry);
  const bg = ix.get<{ name: string }>(build.background)?.name ?? idLabel(build.background);
  const mpMax = sheet.mp.total - sheet.mpBoundByAttunement;
  const errors = validateBuild(build, char.inventory, rules, ix, sheet).filter((i) => i.severity === "error");
  const show = (title: string, value: Value) => setExplain({ title, value });

  const Stone = ({ k, value, sub, big, sign }: { k: string; value: Value; sub?: string; big?: boolean; sign?: boolean }) => (
    <button className={`stone${big ? " big" : ""}`} onClick={() => show(k, value)} aria-label={`${k} ${value.total}, show how it is calculated`}>
      <span className="v">{sign ? signed(value.total) : value.total}</span><span className="k">{k}</span>{sub && <span className="sub">{sub}</span>}
    </button>
  );

  return (
    <main className="shell">
      <header className="section spread">
        <div>
          <h1>{build.name}</h1>
          <div className="muted">Level {sheet.level} {anc}, {bg}</div>
        </div>
        <Link className="btn quiet" to={`/c/${char.id}/level-up`}>Level up</Link>
      </header>
      {errors.length > 0 && <div className="panel section"><h3>This character breaks a rule</h3><div style={{ marginTop: "0.5rem" }}><IssueList issues={errors} /></div></div>}

      <nav className="row section" aria-label="Sheet sections">
        {(["sheet", "skills", "spells", "feats", "gear"] as const).map((t) => (
          <button key={t} className="btn small quiet" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {{ sheet: "Sheet", skills: "Skills", spells: "Spells", feats: "Feats", gear: "Gear" }[t]}
          </button>
        ))}
      </nav>

      {tab === "sheet" && (
        <>
          <section className="section panel grid">
            <Vital kind="bp" label="Body points" current={play.currentBP} max={sheet.bp.total}
              onChange={(v) => setPlay((p) => ({ ...p, currentBP: v }))} onExplain={() => show("Body points", sheet.bp)} />
            <Vital kind="mp" label={sheet.mpBoundByAttunement ? `Mind points (${sheet.mpBoundByAttunement} bound)` : "Mind points"}
              current={play.currentMP} max={mpMax} onChange={(v) => setPlay((p) => ({ ...p, currentMP: v }))} onExplain={() => show("Mind points", sheet.mp)} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Counter label={`Wounds (dies above ${sheet.wt.total})`} value={play.wounds} min={0}
                onChange={(v) => setPlay((p) => ({ ...p, wounds: v }))} danger={play.wounds >= sheet.wt.total} />
              <Counter label="Fate points" value={play.fatePoints} min={0} onChange={(v) => setPlay((p) => ({ ...p, fatePoints: v }))} />
            </div>
            <button className="btn small quiet" style={{ justifySelf: "start" }}
              onClick={() => setPlay((p) => ({ ...p, currentBP: sheet.bp.total, currentMP: mpMax }))}>Full rest: restore BP and MP</button>
          </section>

          <Conditions play={play} setPlay={setPlay} />

          <section className="section">
            <h2>Defense and movement</h2>
            <div className="stones">
              <Stone k="DFR" value={sheet.dfr} big />
              <Stone k="TOU" value={sheet.tou} big />
              <Stone k="SPD" value={sheet.spd} sub="meters" />
              <Stone k="INIT" value={sheet.initiative} sign />
              <Stone k="HDC" value={sheet.hdc} sub="hero DC" />
              <Stone k="WT" value={sheet.wt} sub="wounds" />
            </div>
          </section>

          <section className="section">
            <h2>Saves</h2>
            <div className="stones">
              {SAVES.map((s) => <Stone key={s} k={s[0].toUpperCase() + s.slice(1)} value={sheet.saves[s]} sign />)}
            </div>
          </section>

          <section className="section">
            <h2>Attributes</h2>
            <div className="stones">
              {ATTRIBUTES.map((a) => (
                <button key={a} className="stone" onClick={() => show(ATTRIBUTE_NAMES[a], sheet.attributes[a].score)}>
                  <span className="v">{signed(sheet.attributes[a].modifier)}</span>
                  <span className="k">{a}</span><span className="sub">score {sheet.attributes[a].score.total}</span>
                </button>
              ))}
            </div>
          </section>

          {sheet.situational.length > 0 && (
            <section className="section">
              <h2>Situational bonuses</h2>
              <p className="small muted">These apply only in certain situations and are not included in the numbers above.</p>
              <ul className="list panel" style={{ padding: "0 1rem" }}>
                {sheet.situational.map((p, i) => <li key={i} className="spread small"><span><b>{p.source}</b><br /><span className="muted">{p.note}</span></span><b>{signed(p.value)}</b></li>)}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === "skills" && <SkillsTab sheet={sheet} show={show} />}
      {tab === "spells" && <SpellsTab build={build} play={play} sheet={sheet} setPlay={setPlay} saveBuild={saveBuild} />}
      {tab === "feats" && <FeatsTab feats={[...(sheet.backgroundFeat ? [{ feat: sheet.backgroundFeat, level: 1, fromBackground: true }] : []), ...sheet.feats]} />}
      {tab === "gear" && (
        <GearTab char={char} sheet={sheet} saveItem={saveItem} deleteItem={deleteItem} play={play} setPlay={setPlay}
          showCarry={() => show("Carry", sheet.carry)} />
      )}

      <section className="section">
        <button className="btn danger small" onClick={async () => {
          if (window.confirm(`Delete ${build.name}? This cannot be undone.`)) { await repo.remove(char.id); navigate("/"); }
        }}>Delete character</button>
      </section>

      {explain && <BottomSheet title={explain.title} onClose={() => setExplain(null)}><BreakdownTable value={explain.value} /></BottomSheet>}
    </main>
  );
}

function Vital({ kind, label, current, max, onChange, onExplain }: {
  kind: "bp" | "mp"; label: string; current: number; max: number; onChange: (v: number) => void; onExplain: () => void;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className={`vital ${kind}`}>
      <button className="icon-btn" aria-label={`Lose 1 ${kind.toUpperCase()}`} onClick={() => onChange(current - 1)}>−</button>
      <div>
        <div className="spread">
          <button onClick={onExplain} style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} className="small muted">{label}</button>
          <span><span className="num">{current}</span><span className="muted"> / {max}</span></span>
        </div>
        <div className="meter"><span style={{ width: `${pct}%` }} /></div>
        <div className="row small" style={{ marginTop: "0.35rem" }}>
          {[-10, -5, 5, 10].map((d) => <button key={d} className="btn small quiet" onClick={() => onChange(Math.min(max, current + d))}>{d > 0 ? `+${d}` : d}</button>)}
        </div>
      </div>
      <button className="icon-btn" aria-label={`Gain 1 ${kind.toUpperCase()}`} onClick={() => onChange(Math.min(max, current + 1))}>+</button>
    </div>
  );
}

function Counter({ label, value, min, onChange, danger }: { label: string; value: number; min: number; onChange: (v: number) => void; danger?: boolean }) {
  return (
    <div className="row">
      <button className="icon-btn" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <div style={{ textAlign: "center", minWidth: "6rem" }}>
        <div className="counter" style={danger ? { color: "var(--bad)" } : undefined}>{value}</div>
        <div className="small muted">{label}</div>
      </div>
      <button className="icon-btn" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function Conditions({ play, setPlay }: { play: PlayState; setPlay: (fn: (p: PlayState) => PlayState) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setPlay((p) => ({ ...p, conditions: [...p.conditions, { id: t }] }));
    setText("");
  };
  return (
    <section className="section">
      <h2>Conditions</h2>
      <div className="row" style={{ marginTop: "0.5rem" }}>
        {play.conditions.length === 0 && <span className="small muted">None right now.</span>}
        {play.conditions.map((c, i) => (
          <button key={i} className="tag" style={{ border: 0, cursor: "pointer", padding: "0.3rem 0.7rem" }}
            aria-label={`Remove ${c.id}`} onClick={() => setPlay((p) => ({ ...p, conditions: p.conditions.filter((_, n) => n !== i) }))}>
            {c.id} ✕
          </button>
        ))}
      </div>
      <form className="row" style={{ marginTop: "0.5rem" }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input type="text" placeholder="Add a condition, e.g. Staggered(1)" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
        <button className="btn quiet">Add</button>
      </form>
    </section>
  );
}

function SpellsTab({ build, play, sheet, setPlay, saveBuild }: {
  build: CharacterBuild; play: PlayState; sheet: NonNullable<ReturnType<typeof computeSheet>>;
  setPlay: (fn: (p: PlayState) => PlayState) => void; saveBuild: (fn: (b: CharacterBuild) => CharacterBuild) => void;
}) {
  const { rules, ix } = useRules();
  const [learning, setLearning] = useState(false);
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("");
  const groups = spellGroups(build, sheet, rules, ix);
  const lines = spellLines(build, play, groups, ix);
  const known = new Set(lines.map((l) => l.spell.id));
  const memorized = new Set(play.memorizedSpells ?? []);
  const toggleMem = (id: string) => setPlay((p) => {
    const m = new Set(p.memorizedSpells ?? []);
    if (m.has(id)) m.delete(id); else m.add(id);
    return { ...p, memorizedSpells: [...m] };
  });
  const forget = (id: string) => {
    if (!window.confirm("Forget this spell? It is removed from your known spells.")) return;
    saveBuild((b) => ({ ...b, spells: (b.spells ?? []).filter((s) => s.spell !== id) }));
    setPlay((p) => ({ ...p, memorizedSpells: (p.memorizedSpells ?? []).filter((x) => x !== id) }));
  };
  const learnable = rules.spells.filter((sp) => !known.has(sp.id) && groupForSpell(sp, groups)
    && (!q || sp.name.toLowerCase().includes(q.toLowerCase())) && (!domain || sp.domain === domain))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const accessDomains = [...new Set(groups.flatMap((g) => g.domains))];

  if (!groups.length && !lines.length) {
    return (
      <section className="section panel">
        <h3>No spellcasting yet</h3>
        <p style={{ marginTop: "0.5rem" }}>Spells require a Magic study feat (for example Magic study I: Elementalism). Take one when you level up, and you can learn spells here.</p>
      </section>
    );
  }
  const sections = [...groups.map((g) => ({ g, items: lines.filter((l) => l.group?.id === g.id) })),
    { g: undefined, items: lines.filter((l) => !l.group) }].filter((x) => x.g || x.items.length);
  return (
    <section className="section grid">
      <div className="spread">
        <h2>Spells</h2>
        <button className="btn quiet" aria-pressed={learning} onClick={() => {
          setLearning(!learning);
          if (!learning) window.setTimeout(() => document.getElementById("learn-spell")?.scrollIntoView({ behavior: "smooth" }), 50);
        }}>Learn a spell</button>
      </div>
      <p className="small muted">A spell costs MP equal to its level plus any heightening, and its casting DC is its level plus heightening. Spells at or below your cantrip rank are cast automatically, without a roll.</p>
      {sections.map(({ g, items }) => {
        const memCount = items.filter((l) => memorized.has(l.spell.id)).length;
        return (
          <div key={g?.id ?? "other"} className="panel">
            <div className="spread">
              <h3>{g ? g.name : "No longer within your studies"}</h3>
              {g && <span className={`small ${memCount > g.memorizedLimit ? "" : "muted"}`} style={memCount > g.memorizedLimit ? { color: "var(--bad)" } : undefined}>
                {memCount}/{g.memorizedLimit} memorized</span>}
            </div>
            {g && <p className="small muted" style={{ margin: "0.2rem 0 0" }}>Spells up to level {g.maxLevel}, cantrip rank {g.cantripRank} ({g.realm.name} skill)</p>}
            <ul className="list">
              {items.length === 0 && <li className="small muted">No spells known yet.</li>}
              {items.map((l) => (
                <li key={l.spell.id}>
                  <SpellCard spell={l.spell}
                    badges={<>
                      <span className="tag" style={{ color: "var(--mind)" }}>{l.mpCost} MP</span>
                      <span className="tag">DC {l.spell.level}</span>
                      {l.cantrip && <span className="tag">Cantrip</span>}
                    </>}
                    action={
                      <div className="grid" style={{ gap: "0.3rem", justifyItems: "end" }}>
                        <label className="row small"><input type="checkbox" checked={l.memorized}
                          disabled={!l.memorized && !!g && memCount >= g.memorizedLimit}
                          onChange={() => toggleMem(l.spell.id)} /> Memorized</label>
                        <button className="btn small quiet" onClick={() => forget(l.spell.id)}>Forget</button>
                      </div>} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {learning && (
        <div className="panel grid" id="learn-spell">
          <div className="spread"><h3>Learn a spell</h3><button className="btn small quiet" onClick={() => setLearning(false)}>Done</button></div>
          <p className="small muted">You learn a spell from a scroll, tome or teacher: study it for as many days as its level, then pass a casting check against DC 10 + its level. Add it here once you have learned it.</p>
          <input type="search" placeholder="Search spells you can learn" value={q} onChange={(e) => setQ(e.target.value)} />
          <DomainFilter domains={accessDomains} value={domain} onChange={setDomain} />
          <ul className="list">
            {learnable.slice(0, 40).map((sp) => (
              <li key={sp.id}>
                <SpellCard spell={sp} action={<button className="btn small quiet"
                  onClick={() => saveBuild((b) => ({ ...b, spells: [...(b.spells ?? []), { spell: sp.id, source: "learned" }] }))}>Learn</button>} />
              </li>
            ))}
            {learnable.length === 0 && <li className="small muted">No spells within your studies match.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

function SkillsTab({ sheet, show }: { sheet: NonNullable<ReturnType<typeof computeSheet>>; show: (t: string, v: Value) => void }) {
  const [all, setAll] = useState(false);
  const lines = sheet.skills.filter((s) => all || s.ranks > 0 || s.value.total !== 0);
  return (
    <section className="section">
      <div className="spread">
        <h2>Skills</h2>
        <label className="row small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all</label>
      </div>
      <ul className="list panel" style={{ padding: "0 1rem", marginTop: "0.75rem" }}>
        {lines.map((s) => (
          <li key={s.skill.id}>
            <button className="skill-line" style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}
              onClick={() => show(s.skill.name, s.value)}>
              <span>{s.skill.name}<span className="small muted"> {s.skill.attribute ?? ""}</span></span>
              <span className="small muted">{s.ranks} ranks</span>
              <span className="total">{signed(s.value.total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeatsTab({ feats }: { feats: { feat: Feat; level: number; fromBackground?: boolean; choices?: Record<string, string> }[] }) {
  const { ix } = useRules();
  return (
    <section className="section">
      <h2>Feats</h2>
      <ul className="list panel" style={{ padding: "0 1rem", marginTop: "0.75rem" }}>
        {feats.map(({ feat, level, fromBackground, choices }, i) => (
          <li key={i}>
            <div className="spread">
              <h3 style={{ fontSize: "var(--step-0)" }}>{feat.name} <span className="muted">{actionLabel(feat.action)}</span></h3>
              <span className="small muted">{fromBackground ? "Background" : `Level ${level}`}</span>
            </div>
            <div className="row small">
              {feat.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              {feat.cost?.bp && <span className="tag" style={{ color: "var(--blood)" }}>{feat.cost.bp}{feat.cost.variable ? "*" : ""} BP</span>}
              {feat.cost?.mp && <span className="tag" style={{ color: "var(--mind)" }}>{feat.cost.mp}{feat.cost.variable ? "*" : ""} MP</span>}
              {feat.range && <span className="muted">Range {feat.range}</span>}
            </div>
            <p className="small" style={{ margin: "0.4rem 0 0" }}>{feat.text}</p>
            {choices && Object.values(choices).length > 0 && (
              <p className="small muted" style={{ margin: 0 }}>Chosen: {Object.values(choices).map((c) => ix.get<{ name: string }>(c)?.name ?? c).join(", ")}</p>
            )}
            {feat.clarifications?.map((c, n) => <p key={n} className="clarification">{c}</p>)}
            <p className="small muted" style={{ margin: 0 }}>Page {feat.source.page}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GearTab({ char, sheet, saveItem, deleteItem, play, setPlay, showCarry }: {
  char: Character; sheet: NonNullable<ReturnType<typeof computeSheet>>;
  saveItem: (i: InventoryItem) => void; deleteItem: (i: InventoryItem) => void;
  play: PlayState; setPlay: (fn: (p: PlayState) => PlayState) => void; showCarry: () => void;
}) {
  const { rules, ix } = useRules();
  const [adding, setAdding] = useState<"none" | "catalog" | "custom">("none");
  const [q, setQ] = useState("");
  const catalog: (Weapon | Armor)[] = [...rules.weapons, ...rules.armor];
  const nameOf = (i: InventoryItem) => i.custom?.name ?? ix.get<{ name: string }>(i.ref ?? "")?.name ?? "Item";
  const detail = (i: InventoryItem) => {
    const w = i.ref ? ix.get<Weapon>(i.ref, "weapon") : undefined;
    const a = i.ref ? ix.get<Armor>(i.ref, "armor") : undefined;
    if (w) return `DMG ${w.dmg ?? "*"}${w.range ? `, range ${w.range}` : ""}, ${w.properties.map((p) => `${idLabel(p.property)}${p.param !== undefined ? ` (${p.param})` : ""}`).join(", ")}`;
    if (a) return `DFR ${signed(a.dfr)}, TOU ${signed(a.tou)}${a.dexCap !== null ? `, max DEX ${a.dexCap}` : ""}`;
    return i.custom?.description ?? "";
  };
  return (
    <section className="section grid">
      <div className="spread">
        <h2>Gear</h2>
        <button className="stone" style={{ minHeight: "4rem", width: "7rem" }} onClick={showCarry}>
          <span className="v" style={{ fontSize: "var(--step-2)", color: sheet.overload ? "var(--bad)" : undefined }}>{sheet.enc}/{sheet.carry.total}</span>
          <span className="k">{sheet.overload ? `overload ${sheet.overload}` : "load / carry"}</span>
        </button>
      </div>
      <ul className="list panel" style={{ padding: "0 1rem" }}>
        {char.inventory.length === 0 && <li className="small muted">No gear yet.</li>}
        {char.inventory.map((i) => (
          <li key={i.instanceId} className="grid" style={{ gap: "0.35rem" }}>
            <div className="spread">
              <b>{nameOf(i)}{i.quantity > 1 ? ` ×${i.quantity}` : ""}</b>
              <div className="row">
                <label className="row small"><input type="checkbox" checked={i.equipped} onChange={(e) => saveItem({ ...i, equipped: e.target.checked })} /> {i.ref?.startsWith("armor.") ? "Worn" : "Equipped"}</label>
                {i.custom?.attunementMp ? (
                  <label className="row small"><input type="checkbox" checked={!!i.attuned} onChange={(e) => saveItem({ ...i, attuned: e.target.checked })} /> Attuned ({i.custom.attunementMp} MP)</label>
                ) : null}
              </div>
            </div>
            <div className="small muted">{detail(i)}</div>
            {i.custom?.modifiers?.map((m, n) => <div key={n} className="small">{describeModifier(m)}</div>)}
            <div className="row">
              <button className="btn small quiet" onClick={() => saveItem({ ...i, quantity: Math.max(1, i.quantity - 1) })}>−1</button>
              <button className="btn small quiet" onClick={() => saveItem({ ...i, quantity: i.quantity + 1 })}>+1</button>
              <button className="btn small danger" onClick={() => deleteItem(i)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn quiet" aria-pressed={adding === "catalog"} onClick={() => setAdding(adding === "catalog" ? "none" : "catalog")}>Add from the rulebook</button>
        <button className="btn quiet" aria-pressed={adding === "custom"} onClick={() => setAdding(adding === "custom" ? "none" : "custom")}>Add loot or other item</button>
      </div>
      {adding === "catalog" && (
        <div className="panel grid">
          <input type="search" placeholder="Search weapons and armor" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="list">
            {catalog.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).map((c) => (
              <li key={c.id} className="spread small">
                <span><b>{c.name}</b> <span className="muted">ENC {c.enc ?? 0}, {priceLabel(c.price)}</span></span>
                <button className="btn small quiet" onClick={() => saveItem({ instanceId: crypto.randomUUID(), ref: c.id, quantity: 1, equipped: false })}>Add</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {adding === "custom" && <CustomItemForm onAdd={(i) => { saveItem(i); setAdding("none"); }} />}

      <div className="panel">
        <h3>Money</h3>
        <div className="row" style={{ marginTop: "0.5rem" }}>
          {(["gp", "sp", "bp", "cp"] as Currency[]).map((c) => (
            <label key={c} className="field small" style={{ width: "5.5rem" }}>{c}
              <input type="number" min={0} value={play.money[c]} onChange={(e) => setPlay((p) => ({ ...p, money: { ...p.money, [c]: Math.max(0, Number(e.target.value)) } }))} />
            </label>
          ))}
        </div>
        <p className="small muted" style={{ margin: "0.5rem 0 0" }}>1 gp = 10 sp = 100 bp = 1000 cp (house ruling).</p>
      </div>
    </section>
  );
}

const STAT_TARGETS = ["DFR", "TOU", "BP", "MP", "SPD", "DMR", "Carry", "INIT"] as const;

function describeModifier(m: Modifier): string {
  const t = m.target;
  const target = t.kind === "stat" ? t.stat : t.kind === "save" ? `${t.save} save` : t.kind === "attribute" ? t.attribute : idLabel(t.skill);
  return `${signed(m.value)} ${m.type} ${target}${m.applies === "situational" ? ` (${m.condition})` : ""}`;
}

function CustomItemForm({ onAdd }: { onAdd: (i: InventoryItem) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enc, setEnc] = useState(0);
  const [attune, setAttune] = useState(0);
  const [mods, setMods] = useState<Modifier[]>([]);
  const [stat, setStat] = useState<(typeof STAT_TARGETS)[number]>("DFR");
  const [val, setVal] = useState(1);
  const [type, setType] = useState<"magical" | "item" | "condition">("magical");
  return (
    <form className="panel grid" onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return;
      onAdd({ instanceId: crypto.randomUUID(), quantity: 1, equipped: false, attuned: false,
        custom: { name: name.trim(), description, enc, modifiers: mods, attunementMp: attune || undefined } });
    }}>
      <label className="field">Name<input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ring of protection" /></label>
      <label className="field">Description<textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="row">
        <label className="field" style={{ width: "7rem" }}>ENC<input type="number" step="0.5" min={0} value={enc} onChange={(e) => setEnc(Number(e.target.value))} /></label>
        <label className="field" style={{ width: "10rem" }}>Attunement (MP)<input type="number" min={0} value={attune} onChange={(e) => setAttune(Number(e.target.value))} /></label>
      </div>
      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 6 }}>
        <legend className="small">Bonuses while equipped</legend>
        {mods.map((m, i) => <div key={i} className="spread small"><span>{describeModifier(m)}</span><button type="button" className="btn small quiet" onClick={() => setMods(mods.filter((_, n) => n !== i))}>Remove</button></div>)}
        <div className="row" style={{ marginTop: "0.4rem" }}>
          <input type="number" style={{ width: "5rem" }} value={val} onChange={(e) => setVal(Number(e.target.value))} aria-label="Bonus value" />
          <select style={{ width: "8rem" }} value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Bonus type">
            <option value="magical">magical</option><option value="item">item</option><option value="condition">condition</option>
          </select>
          <select style={{ width: "7rem" }} value={stat} onChange={(e) => setStat(e.target.value as typeof stat)} aria-label="Bonus to">
            {STAT_TARGETS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button type="button" className="btn small quiet" onClick={() => setMods([...mods, { target: { kind: "stat", stat }, value: val, type, applies: "always" }])}>Add bonus</button>
        </div>
      </fieldset>
      <button className="btn">Add item</button>
    </form>
  );
}
