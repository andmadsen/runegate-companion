# Regeldata-skema – v0.2 (godkendt 2026-11-14)

Den tekniske definition ligger i `src/rules/types.ts`. Dette dokument forklarer valgene bag den.

## 1. Tre lag

```
Regelbog (PDF, master)
   │  tools/import/extract.py      maskinelt udtræk – kan køres igen ved hver ny udgave
   ▼
Rå regeldata
   │  data/curation/*.json         manuel kuratering lagt ovenpå, nøglet på stabile ID'er
   ▼
data/rules/<version>/rules.json    den samlede regelpakke, som appen bruger (read-only)
```

**Hvorfor et kurateringslag?** Bogen er skrevet til mennesker. Et udtryk som "+2 TOU" kan importen godt finde, men den kan ikke afgøre, om bonussen er af typen condition eller item, eller om den kun gælder "i cover". Den slags beslutninger skrives i kurateringsfilen. Den er nøglet på ID'er, så næste import af bogen ikke overskriver dem. Hvis bogen ændrer en regel, som er kurateret, viser import-rapporten det.

## 2. ID'er

Format: `<type>.<gruppe>.<navn>` – fx `feat.warrior.riposte`, `spell.fire.firebolt`, `skill.combat-melee-axes`.

- ID'er ændrer sig **aldrig**, heller ikke hvis navnet rettes. Rettes navnet, kommer det gamle navn ind under `aliases`.
- Feats har archetypen med i ID'et, fordi samme navn kan stå under flere archetypes (se konflikt F2).
- Spells har domain med i ID'et, fordi "Find water" findes i to domains.
- Spillernes karakterer refererer **kun** til ID'er. Derfor overlever de en ny version af bogen.

## 3. Fælles felter på alle regler

| Felt | Indhold |
|---|---|
| `id`, `name`, `aliases` | Se ovenfor |
| `text` | Den fulde regeltekst ordret fra bogen, som vises i regelopslag |
| `source` | Bog, version, side og afsnit, så appen kan vise, hvor reglen står |
| `reviewNotes` | Ting, importen ikke kunne afgøre. De samles i `docs/import-report.md` |
| `clarifications` | Husfortolkninger, hvor bogen er uklar (se `docs/conflicts.md`). Vises i appen under regelteksten |

## 4. Modifiers – "hvor kommer +3 fra?"

Alt, der ændrer en værdi på arket, er en `Modifier`:

```json
{ "target": { "kind": "stat", "stat": "DFR" }, "value": 2,
  "type": "condition", "applies": "situational", "condition": "When in cover" }
```

- **`type`** følger bogen s. 12. `condition` stabler altid. `item` og `magical` stabler ikke indbyrdes, så kun den højeste tæller. `score` er ancestry-justeringer af selve attributten.
- **`applies`**: `always` regnes med automatisk. `situational` vises ved værdien ("+2 i cover"), men lægges ikke til. Det svarer til, hvordan man bruger arket ved bordet.
- **`operation: "cap"`** sætter et loft i stedet for at lægge til, fx Treegons maks +3 DEX til DFR.
- **Mål** kan være en attribut, et save, en skill (også mønstre som `skill.combat-melee-*` og spillerens eget valg `$choice.weapon`) eller en afledt værdi (BP, MP, SPD, DFR, TOU, DMR, skill points pr. level …).

Regelmotoren samler alle modifiers fra ancestry, feats, background og udstyr. Den anvender stablingsreglerne og gemmer, hvor hver bidrag kommer fra. Det er det, appen viser, når man trykker på en værdi.

> **Et bevidst valg:** Indtil videre har kun 11 feats fået maskinlæsbare modifiers, og det er dem, der påvirker tal på arket. Feats som "Riposte" beskriver en handling, ikke en ændret værdi. Dem viser arket som tekst med handlingsikon og pris. Kurateringen af de resterende feats med tal-effekter er et separat arbejde i fase 1.

## 5. Feats

| Felt | Eksempel | Kommentar |
|---|---|---|
| `group` | `archetype.rogue` | Archetype eller ancestry |
| `tags` | `["Attack","DeBuff"]` | Ordret fra bogen |
| `isBonus` | `true` | Afgøres af afsnittet "X: Bonus feats" (se F4) |
| `action` | `{ "kind": "action", "count": 2 }` | Læst direkte fra ikonerne i PDF'en: ● / ⊙ / ↶ |
| `cost` | `{ "mp": 3, "variable": true }` | BP/MP-pris. `variable` står for `*` i bogen |
| `prerequisites` | `STR(10)` → `{ "kind": "attribute", "attribute": "STR", "min": 10 }` | Tekst, der ikke kan tolkes, gemmes som `{ "kind": "text" }` og tjekkes ikke automatisk |
| `choices` | Weapons Master: "vælg et våben" | Spilleren vælger, når feat'en tages |
| `equivalenceKey` | `magic-study.warding.3` | Samme feat under flere archetypes kan kun tages én gang (F2) |
| `grantsSpellAccess` | `{ "realmOrDomain": "realm.elementalism", "maxLevel": 5 }` | Magic study-feats |

## 6. Øvrige entiteter

- **Ancestry:** `modifiers` (score-justeringer), `choices` (Human: én attribut +2 eller to +1), `traits` med egne modifiers og `restrictions`.
- **Background:** `benefit` (gratis feat, social standing eller tekst) og `skillRanks`. "Weapon #1" og "Armor #1" er *slots*, som spilleren selv udfylder.
- **Skill:** linked attribute, kategori, armor-straf og subskills. Combat-skills er delt op pr. våbengruppe, som bogen kræver.
- **Weapon / Armor:** tabelværdierne og egenskaber som referencer (`property.fast` med param 5), så egenskabens tekst kan slås op.
- **Spell:** level, realm, domain, tags og de syv spell-variabler som `{ base, step }`. Det gør det muligt at beregne MP-pris og DC ved heightening.
- **Progression:** standard array, modifier-tabel, skill points, rank-pris, rank-bonusbånd (1 / 0,5 / 0,25), level-tabel og social standing.

## 7. Det ligger ikke i regeldataene

- **Formlerne** (BP = STR + STR-mod + …) ligger i regelmotoren som TypeScript-funktioner med tests. Tabeller og konstanter ligger her, så de kan ændres uden kode.
- **Spillernes data** ligger i Supabase.

## 8. Afgjorte spørgsmål

1. **Kuratering:** én fil pr. kategori i `data/curation/` (progression, ancestries, archetypes, feats, spells, properties, sample).
2. **Sprog i regeltekst:** `text` forbliver én engelsk streng (D5: regelteksten er engelsk). Kun brugerfladen bygges, så den kan oversættes.
3. **Situationsbestemte bonusser:** I MVP'en vises de ved værdien ("+2 i cover") og lægges ikke til. En til/fra-knap pr. situation kan tilføjes senere uden at ændre skemaet.
4. **Armor-skills** (K3): kategorien `armor`, uden tilknyttet attribut (`attribute: null`).
5. **Møntværdier** (E1): `progression.currencyInCopper`.
