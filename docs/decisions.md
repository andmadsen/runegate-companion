# Arkitekturbeslutninger

Løsningsarkitekt: projektejeren. Ingen strukturelle ændringer uden godkendelse.

| # | Emne | Beslutning | Dato |
|---|---|---|---|
| D0 | Platform | Webapp: React + TypeScript (Vite), installerbar på mobil (PWA) | 2026-11-13 |
| D1 | Lagring og login | Supabase (Postgres + login + Row Level Security). Kun spillerdata i databasen; regeldata ligger i repoet. Dagligt ping, så databasen ikke går i dvale, og egen backup | 2026-11-13 |
| D2 | Regelkilde | Regelbogen er master. Excel-arket bruges kun som inspiration og vedligeholdes ikke. På sigt kan GM-modulet generere bogen | 2026-11-13 |
| D2a | Importformat | PDF for nu. Word senere; kun læselaget i importen skal skiftes | 2026-11-13 |
| D3 | Husregler | Ja, i GM-modulet, som et kampagne-lag oven på regeldata. Datamodellen forberedes fra start | 2026-11-13 |
| D4 | Adgang til regeltekst | Kun bag login for gruppen. Forfatterens accept indhentes | 2026-11-13 |
| D5 | Sprog | Engelsk UI først, bygget så det kan oversættes | 2026-11-13 |
| D6 | Hosting og repo | Projektejeren ejer GitHub, Supabase og Vercel | 2026-11-13 |
| D7 | Loot | Spillet kører ved bordet; hver spiller vedligeholder selv loot og udstyr. GM-uddeling kommer senere. Spillere kan oprette egne items med modifiers | 2026-11-13 |
| D8 | MVP | Oprettelse og vedligehold af en karakter: creation, sheet, gem, udstyr/loot, level up | 2026-11-13 |
| D9 | MVP-tracking | Aktuelle BP/MP, wounds, conditions og fate points er med i MVP'en. Det er sådan arket bruges ved bordet, og det koster lidt oven på sheetet | 2026-11-14 |
| D10 | Regeldata-skema | v0.2 godkendt; se `docs/schema.md` afsnit 8 | 2026-11-14 |
| D11 | Regelkonflikter | Alle 25 punkter er afgjort som husfortolkninger (`docs/conflicts.md`). De vises i appen og sendes til forfatteren | 2026-11-14 |
| D12 | Databaseskema | `supabase/migrations/…_init.sql`: profiler, kampagner (opretter = GM), medlemmer, karakterer (build + play som JSONB) og inventory. Spillere ejer deres karakterer; GM kan læse dem i kampagnen, men ikke rette | 2026-11-14 |
| D13 | Levering af regeldata | Regeldata ligger i en privat Supabase-bucket (`rules/<version>/rules.json`) og hentes først efter login, så regelbogens tekst ikke ligger i den offentlige app (D4). Seneste version gemmes i browseren til brug uden net | 2026-11-14 |
| D14 | Appens udseende | Stengrå/skifer med runeblå accent, Alegreya + Alegreya Sans, værdier som "runesten", der forklarer sig selv ved tryk | 2026-11-14 |

D9–D11 er truffet af Claude på projektejerens vegne efter hans ønske og kan ændres.

## Næste skridt

- Kuratér modifiers på de resterende feats, der ændrer tal (fase 1)
- Strukturér de 34 feats, hvis forudsætninger står i fri tekst
- Send listen "Til forfatteren" (nederst i `docs/conflicts.md`)
- Opret GitHub-repo (privat), Supabase og Vercel (D6)
