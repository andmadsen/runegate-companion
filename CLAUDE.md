# RuneGate Companion – instruktioner til Claude

Character companion til rollespillet RuneGate. Projektejeren (andmadsen) er **løsningsarkitekt og ikke-koder**: ingen strukturelle beslutninger uden hans godkendelse. Forklar på dansk, i klart sprog. Kode, regeldata og UI-tekst er på engelsk (D5).

## Status (2026-11-14)

Færdigt:
- **Fase 0 – rammer:** beslutninger D0–D12 i `docs/decisions.md`. Whiteboard: https://claude.ai/artifact/6Ab2cHHir6Fme4UMFJWg9K
- **Fase 1 – regeldata:** `tools/import/` læser regelbogen (PDF) → `data/rules/2026-09-19/rules.json`. Kuratering i `data/curation/*.json`. 25 regelkonflikter er afgjort som husfortolkninger (`docs/conflicts.md`, felt `clarifications`).
- **Regelmotor:** `src/engine/` (compute, validate, modifier-stabling), karaktermodel i `src/character/types.ts`. 36 tests: `npm test`.
- **Database:** Supabase-projekt `ahrtztpryhrhkgfvlkzx` (EU). Migrationerne i `supabase/migrations/` er anvendt, og RLS er testet (`supabase/tests/`). Ingen sikkerhedsadvarsler fra Supabase.

- **Fase 2 – app (første version):** React + Vite i `src/app/`. Login via magic link, karakterliste, guidet oprettelse, sheet med forklaring af tal, tracking (BP/MP/wounds/conditions/fate), inventory med egne items og attunement, level up. Kør lokalt uden Supabase-variabler = "local mode" (data i browseren, regler fra repoet).

Næste skridt:
1. Upload `data/rules/2026-09-19/rules.json` til Supabase Storage-bucket `rules` som `2026-09-19/rules.json` (D13).
2. Deploy på Vercel fra GitHub; sæt Supabase Auth → URL Configuration (Site URL + redirect) til Vercel-adressen.
3. PWA/offline, regelopslag (fase 4), GM-modul (fase 5).

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
npm run dev                                              # app lokalt (local mode uden .env.local)
npm run build                                            # produktionsbygget (bruger .env.production)
```

## Miljø

- Projektejerens lokale kopi: `C:\AI\Runegate\runegate-companion` (Windows).
- Git-commits: brug forfatter `andmadsen <andmadsen@users.noreply.github.com>`.
