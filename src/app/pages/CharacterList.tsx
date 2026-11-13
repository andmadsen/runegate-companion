import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { repo, type CharacterSummary } from "../lib/repo.ts";
import { useRules } from "../lib/rules.tsx";
import { idLabel } from "../lib/character.ts";

export function CharacterList() {
  const { ix } = useRules();
  const [items, setItems] = useState<CharacterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { repo.list().then(setItems).catch((e: Error) => setError(e.message)); }, []);
  const name = (id: string) => ix.get<{ name: string }>(id)?.name ?? idLabel(id);

  return (
    <main className="shell">
      <div className="spread section">
        <h1>Characters</h1>
        <Link className="btn" to="/new">New character</Link>
      </div>
      {error && <p style={{ color: "var(--bad)" }}>Could not load characters: {error}</p>}
      {items && items.length === 0 && (
        <div className="panel section">
          <h3>No characters yet</h3>
          <p style={{ marginTop: "0.5rem" }}>Create your first hero. The guide walks you through ancestry, attributes, background, feats, skills and gear.</p>
          <Link className="btn" to="/new">Create a character</Link>
        </div>
      )}
      <ul className="list section">
        {items?.map((c) => (
          <li key={c.id}>
            <Link to={`/c/${c.id}`} className="spread" style={{ textDecoration: "none", color: "inherit" }}>
              <div>
                <h3>{c.name || "Unnamed"}</h3>
                <div className="muted small">{name(c.ancestry)}, {name(c.background)}</div>
              </div>
              <div className="stone" style={{ minHeight: "4rem", width: "4.5rem" }}>
                <span className="v" style={{ fontSize: "var(--step-2)" }}>{c.level}</span>
                <span className="k">level</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
