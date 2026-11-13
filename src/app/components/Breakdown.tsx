import { useEffect, type ReactNode } from "react";
import type { Value } from "../../engine/modifiers.ts";
import { signed } from "../lib/character.ts";

/** Bund-ark, der forklarer hvor en værdi kommer fra. */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="spread">
          <h3>{title}</h3>
          <button className="btn quiet small" onClick={onClose} autoFocus>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function BreakdownTable({ value }: { value: Value }) {
  return (
    <table className="breakdown">
      <tbody>
        {value.parts.map((p, i) => (
          <tr key={i} className={p.counted ? "" : "off"}>
            <td>
              {p.label}
              {p.note && <div className="small muted">{p.note}</div>}
              {!p.counted && !p.note && <div className="small muted">Not counted</div>}
            </td>
            <td className="n">{p.type === "base" && i === 0 ? p.value : signed(p.value)}</td>
          </tr>
        ))}
        <tr className="total"><td>Total</td><td className="n">{value.total}</td></tr>
      </tbody>
    </table>
  );
}
