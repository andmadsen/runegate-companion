# Konfliktliste – regelbog v2026-09-19

Steder hvor bogen modsiger sig selv, mangler en definition eller er tvetydig.
Appen kan ikke regne korrekt på dem uden en beslutning.

> **Status 2026-11-14:** Alle punkter er afgjort af Claude på projektejerens vegne, efter hvad der er mest logisk. Afgørelserne er indarbejdet i regeldataene og kan ændres når som helst. Punkter, hvor bogen bør rettes, er samlet nederst til forfatteren.

**Sådan bruges listen:** Hver konflikt har et forslag til en midlertidig regel, så udviklingen kan fortsætte. Du (eller forfatteren) udfylder *Beslutning*. Når bogen rettes, forsvinder konflikten ved næste import.

Prioritet: 🔴 blokerer MVP (karakteroprettelse/sheet regner forkert) · 🟡 vigtig, men kan vente · ⚪ kosmetisk

---

## Formler og karakteroprettelse

### K1 🔴 Skill points ved level 1
- **s. 126:** "the character has 25 skill points"
- **s. 18 (quicksheet):** "Skill prof (1st lvl): 20 + INT + WIS + CHA"
- **Forslag:** 25 (kapitelteksten er mest specifik).
- **Beslutning:** ✅ 25. Kapitlet om skills er den mest specifikke kilde.

### K2 🔴 Skill points pr. level efter level 1
- **s. 129:** "Every new hero level, the character gains 15 skill points"
- **s. 18 (quicksheet):** "10 + INT + WIS CHA" (der mangler også et +)
- **Forslag:** 15.
- **Beslutning:** ✅ 15 pr. level. Human (+2) og Focused learner (+3) lægges oveni som modifiers.

### K3 🔴 Armor-skills er ikke defineret
- **s. 17:** DFR = 8 + DEX + *armor skill bonus* + armor-DFR. Backgrounds giver ranks i "Armor #1"/"Armor #2".
- Skills-kapitlet har ingen armor-skill: ingen grupper, ingen tilknyttet attribut. (Excel-arket brugte "Light & None / Medium / Heavy".)
- **Forslag:** Tre skills – Armor: Light, Armor: Medium, Armor: Heavy – med en tilknyttet attribut, der skal besluttes. Indtil da regnes armor-skill-bonus som 0.
- **Beslutning:** ✅ Tre skills: Armor: Light, Armor: Medium og Armor: Heavy. De har **ingen tilknyttet attribut**, så bonussen er kun rank-bonussen. DEX tæller allerede i DFR, og en attribut her ville give dobbelt bonus. Skjolde kræver ingen skill.

### K4 🔴 Våbengrupper for ranged passer ikke med udstyrslisten
- **s. 103:** Ranged-kategorier: Bows, Crossbows, Thrown weaponry, Grenades, 1-handed firearms, 2-handed firearms.
- **s. 133:** Udstyrstabellen har gruppen "Firearms" og ingen granater.
- **Forslag:** Flintrock pistol → 1-handed firearms. Double barrel flintrock og Musket → 2-handed firearms. Grenades beholdes som skill uden våben.
- **Beslutning:** ✅ Som forslaget: pistol → 1-handed firearms; double barrel og musket → 2-handed firearms; Grenades bliver en skill uden våben.

### K5 🟡 SPD og overload
- **s. 17 (tekst):** SPD = 10 + STR + CON – overload points
- **s. 18 (quicksheet):** 10 + STR + CON (uden overload)
- **Forslag:** Med overload, som i teksten og i det gamle Excel-ark.
- **Beslutning:** ✅ Med overload, som teksten og det gamle Excel-ark.

### K6 🟡 Initiative
- **s. 18 (quicksheet):** INI = Reaction save bonus – overload points
- **s. 140:** Initiative er et Reaction save. Overload nævnes ikke.
- **Forslag:** Quicksheet-formlen.
- **Beslutning:** ✅ Quicksheet-formlen: Reaction save-bonus – overload points.

### K7 🟡 Afrunding af Hero DC
- **s. 18:** HDC = 10 + halvdelen af level (*rounded up*) + højeste attributmodifier
- **s. 13:** Generel regel: der rundes altid ned, medmindre andet er nævnt.
- **Forslag:** Rund op, fordi HDC-teksten udtrykkeligt siger det.
- **Beslutning:** ✅ Rundes op, fordi HDC-teksten selv siger det.

### K8 🟡 Hvilke skills rammes af maneuver-straf fra rustning?
- **s. 126:** Rustning giver en "Maneuver penalty" til "maneuver skills" og en "Magic penalty" til spell casting. Der står ikke, hvilke skills der er maneuver skills.
- **Forslag:** Acrobatics & Athletics, Stalking & Hiding, Sleight of hands & Trickery og Mechanics & Machinery.
- **Beslutning:** ✅ Som forslaget: Acrobatics & Athletics, Stalking & Hiding, Sleight of hands & Trickery og Mechanics & Machinery.

### K9 🔴 Stabler straffe (negative modifiers)?
- **s. 12:** Item- og magical-modifiers stabler ikke indbyrdes; kun den højeste tæller.
- Tages det bogstaveligt, giver rustning (–4 spell) + skjold (–2 spell) kun –4.
- **Forslag:** Reglen om ikke at stable gælder kun bonusser. Straffe lægges altid sammen.
- **Beslutning:** ✅ Straffe lægges altid sammen. Reglen om, at bonusser ikke stabler, gælder kun bonusser.

### K10 🟡 Bonusser uden type
- Mange regler siger bare "bonus" eller "increased by", fx Elf "+10 MP bonus" og Thick skinned "TOU increased by 2". Typen afgør, om bonussen stabler.
- **Forslag:** En bonus uden type behandles som *condition* og stabler derfor altid.
- **Beslutning:** ✅ En bonus uden type er en condition-bonus.

---

## Feats

### F1 🟡 Combat stamina: 10 eller 5 BP?
- **s. 83:** Pris "Body Points (BP): 10", men teksten siger "Gain an extra action for 5 BP".
- **Forslag:** 10 (feltet), men teksten vises ordret.
- **Beslutning:** ✅ Prisfeltet på 10 BP gælder. Appen viser en afklaring under teksten.

### F2 🔴 Magic study-feats findes i flere archetypes
- "Magic study I–V: Warding" står under tre archetypes, Elementalism og Mysticism under to hver.
- Er det den samme feat? Kan man tage den to gange?
- Kræver Magic study II, at man har I? Der står kun attributkrav.
- **Forslag:** Det er den samme feat (at tage den ét sted tæller overalt), og hvert niveau kræver det forrige.
- **Beslutning:** ✅ Det er samme feat, uanset hvilken archetype den tages fra, og den kan kun tages én gang. Hvert niveau (II–V) kræver det forrige niveau af samme study.

### F3 🟡 Realm eller domain?
- **s. 152:** Spell Study tages pr. *domain* (Fire, Water …).
- Feats findes dog både pr. realm (Elementalism, Mysticism) og pr. domain (Nature, Warding, Dark magic).
- **Forslag:** Følg feat-navnene. Elementalism giver alle fire domains, Mysticism giver Mentalism og Dark magic.
- **Beslutning:** ✅ Følg feat-navnene. Elementalism giver adgang til Fire, Earth, Water og Air. Mysticism giver adgang til Mentalism og Dark magic.

### F4 🟡 Tagget "Bonus" på ancestry-feats
- Ancestry-feats som Weapons Master har tagget "Bonus", men står under "Optional feats" og vælges ganske almindeligt.
- **Forslag:** Om en feat er en bonus-feat, afgøres af afsnittet ("X: Bonus feats"), ikke af tagget.
- **Beslutning:** ✅ Afsnittet afgør det. Tagget "Bonus" på ancestry-feats betyder bare, at feat'en giver en bonus.

### F5 🟡 Flow of Nature giver bonus til en skill, der ikke findes
- **s. 87:** "+1 conditional modifier to Magic: Nature". Nature er et domain under Magic: Spiritualism.
- **Forslag:** +1 til Spiritualism-checks, når der castes Nature-spells.
- **Beslutning:** ✅ +1 til Magic: Spiritualism, når der castes Nature-spells.

### F6 ⚪ Pain Relief nævner "Stunned (S)"
- Crit-effekten "S" hedder ellers Staggered.
- **Forslag:** Staggered.
- **Beslutning:** ✅ Læses som Staggered (S). Appen viser en afklaring.

### F7 ⚪ Feat-navne i backgrounds stavet anderledes
- "Traveller" ≠ "Traveler", "Quick stride" ≠ "Quickstride". Appen kobler dem allerede via aliaser.
- **Beslutning:** ✅ Aliaserne beholdes, og forfatteren gøres opmærksom på stavemåden.

### F8 ⚪ 34 feats har forudsætninger i fri tekst
- Fx "Must be in ‘Rage stance’" og "Feat: My body is my temple". Det er ikke en fejl i bogen, men de skal struktureres i kurateringen, før appen kan tjekke dem.

---

## Udstyr

### E1 🔴 Ingen omregning mellem mønter
- Priserne er i gp/sp/bp/cp, men bogen siger ikke, hvad de er værd i forhold til hinanden.
- **Forslag:** Skal afgøres – appen skal bruge det til at lægge formue sammen.
- **Beslutning:** ✅ Decimalsystem: 1 gp = 10 sp = 100 bp = 1000 cp. Det passer med rækkefølgen i social standing-tabellen.

### E2 🟡 Våbenegenskaber uden definition
- Thrown (S), Reach (4), Two-handed, Minor, Slow reload (x) og Agile (x) (fra "War is in my blood") bruges, men forklares ikke.
- **Beslutning:** ✅ Midlertidige definitioner, markeret som husfortolkning, indtil forfatteren leverer de rigtige: **Thrown (x)** kan kastes med range x. **Reach (x)** kan angribe op til x meter væk. **Two-handed** kræver begge hænder. **Minor** giver let skade, og hvad det betyder præcist, afventer forfatteren. **Slow reload (x)** skal genlades over x runder. **Agile (x)** giver +x til Acrobatics & Athletics.

### E3 ⚪ Chain shirt vejer mere end Half plate
- Chain shirt har ENC 12, Half plate har ENC 11. Er det en tastefejl?
- **Beslutning:** ✅ Bogens værdier bruges uændret (Chain shirt ENC 12). Forfatteren får besked.

### E4 ⚪ Skader: tal eller terninger?
- Bogen giver DMG som et tal (fx Longsword 7). Det gamle Excel-ark brugte terninger (#d / d#).
- **Forslag:** Appen følger bogen.
- **Beslutning:** ✅ Appen følger bogen: DMG er et fast tal.

### E5 🟡 Treegon og skjolde
- "Can’t wear armor and weapons". Gælder det også skjolde?
- **Beslutning:** ✅ Gælder også skjolde, fordi skjolde står i rustningstabellen.

---

## Spells

### S1 ⚪ Nightfall: zone eller burst?
- Teksten beskriver en zone, men værdien 4/2 står i burst-kolonnen.
- **Beslutning:** ✅ Det er en zone, som teksten siger. Værdien 4/2 flyttes til zone-kolonnen.

### S2 ⚪ Tag-stavning
- Én spell har tagget "Concentrate", alle andre bruger "Concentration".
- **Beslutning:** ✅ Normaliseres til "Concentration".

### S3 ⚪ Free action-ikonet er ikke forklaret
- ⊙ bruges som free action (fx War dancer), men står ikke i forklaringen af ikonerne på s. 140. Shield-egenskaben Block bruger desuden et andet reaction-ikon end resten af bogen.
- **Beslutning:** ✅ ⊙ er en free action. Begge pile-ikoner er reactions.

---

## Spells (tilføjet 2026-11-14)

### K11 🔴 Startspells ved study-feats for et helt realm
- **s. 127/153:** "3 spells fra hvert tier, man har en feat for". Eksemplet bruger domæne-feats (Warding, Nature), men nogle feats gælder et helt realm (Elementalism, Mysticism).
- **Beslutning:** ✅ 3 spells pr. study-feat-tier. Magic study I: Elementalism giver 3 spells på level 1–5, frit fordelt på Fire, Earth, Air og Water. Kun studies taget på level 1 giver startspells.

### K12 🟡 Grænse for memoriserede spells
- **s. 153:** "5 + the spell domains linked attribute + ½ Hero level". Det fremgår ikke, om grænsen gælder samlet eller pr. domæne.
- **Beslutning:** ✅ Pr. study (realm eller domæne): 5 + modifier for realmets casting-attribut + ½ level, rundet ned.

### K13 ⚪ Spells lært under spillet
- **s. 152:** Spells læres fra skriftruller, bøger og lærere. Det kræver studietid og et check mod DC 10 + spellens level.
- **Beslutning:** ✅ Spilleren tilføjer selv lærte spells i appen. Der er ingen grænse for antallet, men spellen skal ligge inden for ens studies. Checket slås ved bordet.

### K14 ⚪ Druidic practices
- "Gain 3 extra Nature spells from start."
- **Beslutning:** ✅ Kræver adgang til Nature-spells. De 3 spells kan vælges fra ethvert tier, man har adgang til.

---

## Til forfatteren – forslag til rettelser i bogen

1. Skill points: gør s. 18 ens med s. 126 og s. 129 (25 ved start, 15 pr. level).
2. Definér armor-skills i Skills-kapitlet.
3. Ranged-våbengrupper: brug 1-handed og 2-handed firearms i udstyrstabellen.
4. SPD og INI: gør quicksheet og tekst ens.
5. Magic study: skriv, at feat'en er den samme på tværs af archetypes, og at hvert niveau kræver det forrige.
6. Definér Thrown, Reach, Two-handed, Minor, Slow reload og Agile.
7. Skriv, hvad mønterne er værd i forhold til hinanden.
8. Combat stamina (10 eller 5 BP), Pain Relief (Staggered), Flow of Nature (Magic: Nature), Nightfall (zone/burst).
9. Stavning: Traveller/Traveler, Quick stride/Quickstride, Concentrate/Concentration.
10. Chain shirt ENC 12 – er det rigtigt?
11. Treegon og skjolde.
12. Forklar ⊙ (free action) sammen med de andre ikoner på s. 140.
13. Spells: gælder 3 startspells pr. realm-feat eller pr. domæne? Er grænsen for memoriserede spells samlet eller pr. domæne?
