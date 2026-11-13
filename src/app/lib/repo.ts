/**
 * Lagring af karakterer. Samme interface for Supabase og for lokal tilstand (browserens lager),
 * så resten af appen ikke skal vide, hvor data bor.
 */
import type { Character, CharacterBuild, InventoryItem, PlayState } from "../../character/types.ts";
import { supabase } from "./supabase.ts";

export interface CharacterSummary {
  id: string;
  name: string;
  level: number;
  ancestry: string;
  background: string;
  updatedAt: string;
}

export interface Repo {
  list(): Promise<CharacterSummary[]>;
  get(id: string): Promise<Character | null>;
  create(build: CharacterBuild, inventory: InventoryItem[], play: PlayState): Promise<string>;
  saveBuild(id: string, build: CharacterBuild): Promise<void>;
  savePlay(id: string, play: PlayState): Promise<void>;
  saveItem(characterId: string, item: InventoryItem): Promise<void>;
  deleteItem(characterId: string, instanceId: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const summary = (id: string, b: CharacterBuild, updatedAt: string): CharacterSummary => ({
  id, name: b.name, level: b.levels.length, ancestry: b.ancestry, background: b.background, updatedAt,
});

// ---------------------------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------------------------
interface ItemRow {
  id: string; ref: string | null; custom: InventoryItem["custom"] | null; quantity: number;
  equipped: boolean; attuned: boolean; notes: string | null; sort_order: number;
}
const toRow = (characterId: string, i: InventoryItem, sort = 0) => ({
  id: i.instanceId, character_id: characterId, ref: i.ref ?? null, custom: i.custom ?? null,
  quantity: i.quantity, equipped: i.equipped, attuned: i.attuned ?? false, notes: i.notes ?? null, sort_order: sort,
});
const fromRow = (r: ItemRow): InventoryItem => ({
  instanceId: r.id, ref: r.ref ?? undefined, custom: r.custom ?? undefined, quantity: r.quantity,
  equipped: r.equipped, attuned: r.attuned, notes: r.notes ?? undefined,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const supabaseRepo = (): Repo => {
  const db = supabase!;
  return {
    async list() {
      const rows = check(await db.from("characters").select("id, build, updated_at").order("updated_at", { ascending: false }));
      return (rows as { id: string; build: CharacterBuild; updated_at: string }[]).map((r) => summary(r.id, r.build, r.updated_at));
    },
    async get(id) {
      const row = check(await db.from("characters").select("id, build, play").eq("id", id).maybeSingle());
      if (!row) return null;
      const items = check(await db.from("inventory_items").select("*").eq("character_id", id).order("sort_order"));
      const r = row as { id: string; build: CharacterBuild; play: PlayState };
      return { id: r.id, build: r.build, play: r.play, inventory: (items as ItemRow[]).map(fromRow) };
    },
    async create(build, inventory, play) {
      const row = check(await db.from("characters")
        .insert({ name: build.name, rules_version: build.rulesVersion, build, play }).select("id").single());
      const id = (row as { id: string }).id;
      if (inventory.length) check(await db.from("inventory_items").insert(inventory.map((i, n) => toRow(id, i, n))));
      return id;
    },
    async saveBuild(id, build) {
      check(await db.from("characters").update({ build, name: build.name, rules_version: build.rulesVersion }).eq("id", id));
    },
    async savePlay(id, play) { check(await db.from("characters").update({ play }).eq("id", id)); },
    async saveItem(characterId, item) { check(await db.from("inventory_items").upsert(toRow(characterId, item))); },
    async deleteItem(_c, instanceId) { check(await db.from("inventory_items").delete().eq("id", instanceId)); },
    async remove(id) { check(await db.from("characters").delete().eq("id", id)); },
  };
};

// ---------------------------------------------------------------------------------------------
// Lokal tilstand (browserens lager) – til udvikling og test
// ---------------------------------------------------------------------------------------------
const KEY = "rg.local.characters";
type Stored = Record<string, Character & { updatedAt: string }>;
const read = (): Stored => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const write = (s: Stored) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
const now = () => new Date().toISOString();

const localRepo = (): Repo => ({
  async list() { return Object.values(read()).map((c) => summary(c.id, c.build, c.updatedAt)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
  async get(id) { return read()[id] ?? null; },
  async create(build, inventory, play) {
    const s = read(); const id = crypto.randomUUID();
    s[id] = { id, build, inventory, play, updatedAt: now() }; write(s); return id;
  },
  async saveBuild(id, build) { const s = read(); if (s[id]) { s[id].build = build; s[id].updatedAt = now(); write(s); } },
  async savePlay(id, play) { const s = read(); if (s[id]) { s[id].play = play; s[id].updatedAt = now(); write(s); } },
  async saveItem(id, item) {
    const s = read(); const c = s[id]; if (!c) return;
    const i = c.inventory.findIndex((x) => x.instanceId === item.instanceId);
    if (i >= 0) c.inventory[i] = item; else c.inventory.push(item);
    c.updatedAt = now(); write(s);
  },
  async deleteItem(id, instanceId) {
    const s = read(); const c = s[id]; if (!c) return;
    c.inventory = c.inventory.filter((x) => x.instanceId !== instanceId); write(s);
  },
  async remove(id) { const s = read(); delete s[id]; write(s); },
});

export const repo: Repo = supabase ? supabaseRepo() : localRepo();
