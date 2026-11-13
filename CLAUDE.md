# RuneGate Companion – instruktioner til Claude

Character companion til rollespillet RuneGate. Projektejeren (andmadsen) er **løsningsarkitekt og ikke-koder**: ingen strukturelle beslutninger uden hans godkendelse. Forklar på dansk, i klart sprog. Kode, regeldata og UI-tekst er på engelsk (D5).

## Status (2026-11-14)

Færdigt:
- **Fase 0 – rammer:** beslutninger D0–D12 i `docs/decisions.md`. Whiteboard: https://claude.ai/artifact/6Ab2cHHir6Fme4UMFJWg9K
- **Fase 1 – regeldata:** `tools/import/` læser regelbogen (PDF) → `data/rules/2026-09-19/rules.json`. Kuratering i `data/curation/*.json`. 25 regelkonflikter er afgjort som husfortolkninger (`docs/conflicts.md`, felt `clarifications`).
- **Regelmotor:** `src/engine/` (compute, validate, modifier-stabling), karaktermodel i `src/character/types.ts`. 36 tests: `npm test`.
- **Database:** Supabase-projekt `ahrtztpryhrhkgfvlkzx` (EU). Migrationerne i `supabase/migrations/` er anvendt, og RLS er testet (`supabase/tests/`). Ingen sikkerhedsadvarsler fra Supabase.

Næste skridt (fase 2 – MVP, D8/D9):
1. React + Vite + TypeScript-app (PWA) i `app/` eller i roden: login via Supabase (magic link), karakterliste, guidet oprettelse (ancestry → attributter → background → feats → skills → saves → udstyr), sheet med "hvor kommer tallet fra", inventory og level up, tracking af BP/MP/wounds/conditions.
2. Deploy på Vercel fra GitHub.

## Faste principper

- Gem **valg**, beregn tal (regelmotoren). Ingen beregnede værdier i databasen.
- Regeldata er read-only og versioneret. Regelbogen er master (D2).
- Husfortolkninger vises for spillerne (felt `clarifications`).
- Kun spillerdata i Supabase. Den publishable key er offentlig (`.env.example`); service_role-nøglen må aldrig i repoet.
- Regeltekst er forfatterens: repoet skal forblive privat (D4).

## Kommandoer

```bash
python3 -I tools/import/build_rules.py <regelbog.pdf>   # byg regeldata
npm run typecheck && npm test                            # regelmotor (Node 22.18+)
```

## Miljø

- Projektejerens lokale kopi: `C:\AI\Runegate\runegate-companion` (Windows).
- Git-commits: brug forfatter `andmadsen <andmadsen@users.noreply.github.com>`.
