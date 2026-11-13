# RuneGate Companion

Character companion til rollespillet RuneGate: karakteroprettelse, character sheet, vedligehold (udstyr, loot, level up) og regelopslag. Et GM-modul følger senere.

## Struktur

```
src/rules/types.ts          Regeldata-skemaet (TypeScript)
src/character/types.ts      Karakterens datamodel – gemte valg, inventory, tilstand under spil
src/engine/                 Regelmotoren: modifiers.ts (stabling), compute.ts (sheet), validate.ts
test/engine.test.ts         Tests med håndregnede eksempelkarakterer
tools/import/extract.py     Læser regelbogen (PDF) og trækker regler ud
tools/import/build_rules.py Udtræk + kuratering → regelpakke + import-rapport
data/curation/*.json        Manuel kuratering, én fil pr. kategori (modifiers, valg, husfortolkninger, prøveudsnit)
data/rules/<version>/       Genereret regelpakke (rules.json, rules.sample.json)
docs/                       Beslutninger, skema, konfliktliste, import-rapport
```

## Byg regeldata

Kræver Python 3.11+ og `pdftotext` (poppler-utils).

```bash
python3 -I tools/import/build_rules.py sti/til/RuneGate_Core_Rulebook.pdf
```

## Valider mod skemaet

```bash
for f in rules.sample rules; do
  (echo 'import type { RulesPackage } from "../src/rules/types";'
   echo -n 'export const pkg: RulesPackage = '; cat data/rules/2026-09-19/$f.json; echo ';') > build/$f.check.ts
done
tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler build/*.check.ts
```

## Test regelmotoren

Kræver Node 22.18+ (kører TypeScript direkte) og TypeScript.

```bash
npm run typecheck
npm test
```

Arkitekturbeslutningerne står i `docs/decisions.md`.
