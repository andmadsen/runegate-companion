import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { RulesPackage } from "../../rules/types.ts";
import { RulesIndex } from "../../engine/compute.ts";
import { supabase } from "./supabase.ts";

export const RULES_VERSION = "2026-09-19";
const CACHE_KEY = `rg.rules.${RULES_VERSION}`;

interface RulesState {
  rules: RulesPackage | null;
  ix: RulesIndex | null;
  error: string | null;
}
const RulesContext = createContext<RulesState>({ rules: null, ix: null, error: null });

/**
 * Regeldata indeholder regelbogens tekst og må kun hentes af brugere, der er logget ind (D4).
 * Med Supabase: fra den private bucket "rules". Lokalt: direkte fra repoet (kun under udvikling).
 * Den seneste version gemmes i browseren, så sheetet også virker uden net ved bordet.
 */
async function loadRules(): Promise<RulesPackage> {
  if (!supabase) {
    if (import.meta.env.DEV) {
      const mod = await import("../../../data/rules/2026-09-19/rules.json");
      return mod.default as unknown as RulesPackage;
    }
    throw new Error("Supabase er ikke konfigureret.");
  }
  try {
    const { data, error } = await supabase.storage.from("rules").download(`${RULES_VERSION}/rules.json`);
    if (error || !data) throw new Error(error?.message ?? "Regeldata mangler i lageret.");
    const text = await data.text();
    try { localStorage.setItem(CACHE_KEY, text); } catch { /* fuld eller utilgængelig */ }
    return JSON.parse(text) as RulesPackage;
  } catch (e) {
    let cached: string | null = null;
    try { cached = localStorage.getItem(CACHE_KEY); } catch { /* ignore */ }
    if (cached) return JSON.parse(cached) as RulesPackage;
    throw e;
  }
}

export function RulesProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [state, setState] = useState<RulesState>({ rules: null, ix: null, error: null });
  useEffect(() => {
    if (!enabled || state.rules) return;
    loadRules()
      .then((rules) => setState({ rules, ix: new RulesIndex(rules), error: null }))
      .catch((e: Error) => setState({ rules: null, ix: null, error: e.message }));
  }, [enabled, state.rules]);
  return <RulesContext.Provider value={state}>{children}</RulesContext.Provider>;
}

export function useRules(): { rules: RulesPackage; ix: RulesIndex } {
  const s = useContext(RulesContext);
  if (!s.rules || !s.ix) throw new Error("useRules kaldt før regeldata er indlæst");
  return { rules: s.rules, ix: s.ix };
}
export const useRulesState = () => useContext(RulesContext);
