import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * null betyder "lokal tilstand": ingen Supabase konfigureret (udvikling og test).
 * Så gemmes karakterer i browseren, og regeldata hentes fra repoet.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const isLocalMode = supabase === null;
