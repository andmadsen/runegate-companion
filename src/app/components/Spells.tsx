import { useState } from "react";
import type { Spell, SpellVariableName } from "../../rules/types.ts";
import { useRules } from "../lib/rules.tsx";

const VAR_LABEL: Record<SpellVariableName, string> = {
  range: "Range", blast: "Blast", burst: "Burst", zone: "Zone", duration: "Duration", dmr: "DMR", intensity: "Intensity",
};

/** Spellens variabler som "base / pr. heightening" – kun dem, der er i brug. */
export function SpellVariables({ spell }: { spell: Spell }) {
  const used = (Object.keys(VAR_LABEL) as SpellVariableName[]).filter((k) => spell.variables[k].base !== null);
  if (!used.length) return null;
  return (
    <div className="row small" style={{ marginTop: "0.3rem" }}>
      {used.map((k) => {
        const v = spell.variables[k];
        return <span key={k} className="tag" title="Base value / added per heightening rank">{VAR_LABEL[k]} {v.base}{v.step ? ` / +${v.step}` : ""}</span>;
      })}
    </div>
  );
}

/** Kort med en spell: navn, level, domæne, tags, variabler og (udfoldelig) tekst. */
export function SpellCard({ spell, action, badges }: { spell: Spell; action?: React.ReactNode; badges?: React.ReactNode }) {
  const { rules } = useRules();
  const [open, setOpen] = useState(false);
  const domain = rules.progression.realms.flatMap((r) => r.domains).find((d) => d.id === spell.domain)?.name;
  return (
    <div>
      <div className="spread">
        <div>
          <h3 style={{ fontSize: "var(--step-0)" }}>{spell.name}</h3>
          <div className="row small">
            <span className="muted">Level {spell.level} {domain}</span>
            {spell.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            {badges}
          </div>
        </div>
        {action}
      </div>
      <SpellVariables spell={spell} />
      <button className="small" onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ background: "none", border: 0, padding: "0.3rem 0 0", color: "var(--rune)", cursor: "pointer" }}>
        {open ? "Hide description" : "Show description"}
      </button>
      {open && <p className="small" style={{ margin: "0.3rem 0 0" }}>{spell.text}</p>}
      {open && spell.clarifications?.map((c, i) => <p key={i} className="clarification">{c}</p>)}
    </div>
  );
}

/** Filterknapper pr. domæne, når en study dækker flere (fx Elementalism). */
export function DomainFilter({ domains, value, onChange }: { domains: string[]; value: string; onChange: (d: string) => void }) {
  const { rules } = useRules();
  if (domains.length < 2) return null;
  const name = (id: string) => rules.progression.realms.flatMap((r) => r.domains).find((d) => d.id === id)?.name ?? id;
  return (
    <div className="row" role="group" aria-label="Filter by domain" style={{ marginTop: "0.5rem" }}>
      <button className="btn small quiet" aria-pressed={value === ""} onClick={() => onChange("")}>All</button>
      {domains.map((d) => <button key={d} className="btn small quiet" aria-pressed={value === d} onClick={() => onChange(d)}>{name(d)}</button>)}
    </div>
  );
}
