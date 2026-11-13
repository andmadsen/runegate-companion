import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isLocalMode } from "./supabase.ts";

interface AuthState {
  ready: boolean;
  /** I lokal tilstand er man altid "logget ind" som en lokal bruger. */
  userId: string | null;
  email: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ ready: false, userId: null, email: null, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(isLocalMode);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = isLocalMode
    ? { ready: true, userId: "local", email: "local", signOut: async () => {} }
    : { ready, userId: session?.user.id ?? null, email: session?.user.email ?? null,
        signOut: async () => { await supabase!.auth.signOut(); } };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export async function sendMagicLink(email: string): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.auth.signInWithOtp({
    email, options: { emailRedirectTo: window.location.origin },
  });
  return error ? error.message : null;
}
