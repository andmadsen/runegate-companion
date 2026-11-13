"""
RuneGate regelbog -> regeldata (JSON).

Læselag:   read_pdf()   – PDF -> liste af (sidetal, linjer). Skiftes ud med read_docx() senere.
Tolkelag:  parse_*()    – linjer -> entiteter efter skemaet i src/rules/types.ts.

Brug:
    python3 -I tools/import/extract.py <regelbog.pdf> <output-mappe>

Kræver kun poppler-utils (pdftotext). Ingen netværk.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

BOOK_VERSION = "2026-09-19"

# Wingdings-tegn i PDF'en (privat Unicode-område) -> handlingsikoner
ICON_ACTION = ""    # ●
ICON_FREE = ""      # ⊙
ICON_REACTION = ("", "")  # pile
ICON_PAD = ""       # mellemrum i Wingdings, ignoreres
ICONS = {ICON_ACTION, ICON_FREE, ICON_PAD, *ICON_REACTION}

ARCHETYPES = ["Warrior", "Rogue", "Primal", "Leader", "Mystic", "Universal"]
ANCESTRIES = ["Human", "Elf", "Dwarf", "Treegon"]
FEAT_GROUPS = ARCHETYPES + ANCESTRIES
FEAT_TAGS = {"Passive", "Buff", "DeBuff", "Attack", "Bonus", "Magic", "Enable",
             "Defense", "Skill", "Heal", "Concentration", "Movement", "Stance",
             "Disengage", "Companion", "AoE", "Morph"}
TAG_ALIASES = {"Debuff": "DeBuff", "Move": "Movement"}


# ---------------------------------------------------------------------------
# Læselag
# ---------------------------------------------------------------------------

def read_pdf(path: str) -> list[tuple[int, list[str]]]:
    raw = subprocess.run(["pdftotext", "-raw", "-enc", "UTF-8", path, "-"],
                         check=True, capture_output=True).stdout.decode("utf-8")
    pages = []
    for chunk in raw.split("\f"):
        lines = [ln.rstrip() for ln in chunk.split("\n")]
        m = next((re.match(r"Page (\d+) af \d+", ln) for ln in lines if ln.startswith("Page ")), None)
        if not m:
            continue
        page = int(m.group(1))
        pages.append((page, [ln for ln in lines if not re.match(r"Page \d+ af \d+$", ln)]))
    return pages


def clean(s: str) -> str:
    """Fjern ikoner og ligaturer (ﬁ -> fi) til visningstekst."""
    s = s.replace(ICON_PAD, " ").replace(ICON_ACTION, "●").replace(ICON_FREE, "⊙")
    for r in ICON_REACTION:
        s = s.replace(r, "↶")
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"[ \t]+", " ", s).strip()


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", clean(s)).encode("ascii", "ignore").decode()
    s = s.lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def src(page: int, section: str | None = None) -> dict:
    d = {"book": "core", "version": BOOK_VERSION, "page": page}
    if section:
        d["section"] = section
    return d


# ---------------------------------------------------------------------------
# Feats
# ---------------------------------------------------------------------------

def parse_action(name_line: str) -> dict | None:
    n_action = name_line.count(ICON_ACTION)
    if any(r in name_line for r in ICON_REACTION):
        n = sum(name_line.count(r) for r in ICON_REACTION)
        return {"kind": "reaction", "count": min(n, 2)}
    if ICON_FREE in name_line:
        return {"kind": "free"}
    if n_action:
        return {"kind": "action", "count": min(n_action, 3)}
    return None


def is_tag_line(line: str) -> bool:
    toks = clean(line).split()
    return (bool(toks) and toks[0] in FEAT_GROUPS and len(toks) <= 7
            and all(re.fullmatch(r"[A-Z][A-Za-z]*", t) for t in toks[1:]))


PREREQ_ATTR = re.compile(r"\b(STR|CON|DEX|INT|WIS|CHA)\s*\((\d+)\)")
PREREQ_COUNT = re.compile(r"(\d+)\s+non-bonus feats", re.I)


def parse_prereqs(text: str) -> list[dict]:
    t = clean(text)
    if t.lower() in ("none", ""):
        return []
    out = []
    rest = t
    for m in PREREQ_ATTR.finditer(t):
        out.append({"kind": "attribute", "attribute": m.group(1), "min": int(m.group(2))})
        rest = rest.replace(m.group(0), "")
    m = PREREQ_COUNT.search(t)
    if m:
        out.append({"kind": "featCount", "min": int(m.group(1)), "counts": "nonBonus"})
        rest = rest.replace(m.group(0), "")
    if t in ANCESTRIES:
        out.append({"kind": "ancestry", "ancestry": f"ancestry.{slug(t)}"})
        rest = ""
    rest = rest.strip(" ,;")
    if rest:
        out.append({"kind": "text", "text": rest})
    return out


STOP_LINE = re.compile(
    r"(?i)^(" + "|".join(FEAT_GROUPS) + r")(: (Bonus feats|Feats|Optional feats))?$"
    r"|^Feats \((Archetypes|Ancestries)\)$|^Backgrounds$")


def parse_feats(pages) -> list[dict]:
    # flad liste af (side, linje) for feat-kapitlerne (s. 23-89)
    lines = [(p, ln) for p, ls in pages if 23 <= p <= 89 for ln in ls]
    feats, i = [], 0
    section = None
    while i < len(lines):
        page, ln = lines[i]
        c = clean(ln)
        if re.match(r"^(\w+): (Bonus feats|Feats|Optional feats)$", c, re.I):
            section = c
        # en feat starter med: navn, tag-linje, Prerequisites:
        if (i + 2 < len(lines) and is_tag_line(lines[i + 1][1])
                and clean(lines[i + 2][1]).startswith("Prerequisites:")):
            name_line = ln
            toks = clean(lines[i + 1][1]).split()
            group = toks[0]
            tags = [TAG_ALIASES.get(t, t) for t in toks[1:]]
            unknown_tags = [t for t in tags if t not in FEAT_TAGS]
            prereq_text = clean(lines[i + 2][1])[len("Prerequisites:"):].strip()
            j = i + 3
            # forudsætninger der fortsætter på næste linje
            while j < len(lines) and (prereq_text.endswith((",", " a", " an", " the"))
                                      or re.match(r"^[a-z]", clean(lines[j][1]))) \
                    and not re.match(r"^(Range|Body Points|Mind Points)", clean(lines[j][1])):
                prereq_text += " " + clean(lines[j][1])
                j += 1
            feat = {
                "id": f"feat.{slug(group)}.{slug(name_line)}",
                "name": re.sub(r"[●⊙↶]", "", clean(name_line)).strip(),
                "group": f"{'ancestry' if group in ANCESTRIES else 'archetype'}.{slug(group)}",
                "tags": tags,
                # Afgøres af afsnittet ("Warrior: Bonus feats"), ikke af tagget "Bonus",
                # som også bruges på ancestry-feats, der ikke er bonus-feats.
                "isBonus": bool(section and section.lower().endswith("bonus feats")),
                "action": parse_action(name_line),
                "prerequisitesText": prereq_text,
                "prerequisites": parse_prereqs(prereq_text),
                "modifiers": [],
                "choices": [],
                "source": src(page, section),
            }
            if unknown_tags:
                feat["reviewNotes"] = [f"Ukendte tags: {', '.join(unknown_tags)}"]
            cost = {}
            while j < len(lines):
                cj = clean(lines[j][1])
                if cj.startswith("Range:"):
                    feat["range"] = cj[6:].strip()
                elif m := re.match(r"Body Points \(BP\):\s*(\d+)(\*?)", cj):
                    cost["bp"] = int(m.group(1)); cost["variable"] = cost.get("variable") or bool(m.group(2))
                elif m := re.match(r"Mind Points \(MP\):\s*(\d+)(\*?)", cj):
                    cost["mp"] = int(m.group(1)); cost["variable"] = cost.get("variable") or bool(m.group(2))
                else:
                    break
                j += 1
            if cost:
                if not cost.get("variable"):
                    cost.pop("variable", None)
                feat["cost"] = cost
            body = []
            while j < len(lines):
                if (j + 2 < len(lines) and is_tag_line(lines[j + 1][1])
                        and clean(lines[j + 2][1]).startswith("Prerequisites:")):
                    break
                if STOP_LINE.match(clean(lines[j][1])):
                    break
                body.append(lines[j][1])
                j += 1
            feat["text"] = join_paragraph(body)
            ms = re.match(r"Magic study (I{1,3}|IV|V): (.+)$", feat["name"])
            if ms:
                roman = ["I", "II", "III", "IV", "V"]
                lvl = roman.index(ms.group(1))
                feat["equivalenceKey"] = f"magic-study.{slug(ms.group(2))}.{lvl + 1}"
                if lvl > 0:
                    prev = f"feat.{slug(group)}.{slug('Magic study ' + roman[lvl - 1] + ': ' + ms.group(2))}"
                    feat["prerequisites"].append({"kind": "feat", "feat": prev})
                feat.setdefault("clarifications", []).append(
                    "Husfortolkning: samme feat på tværs af archetypes (kan tages én gang); "
                    "hvert niveau kræver det forrige.")
            m = re.search(r"maximum of level (\d+)", feat["text"])
            if feat["name"].startswith("Magic study") and m:
                target = feat["name"].split(":", 1)[1].strip()
                kind = "realm" if target in REALMS else "domain"
                feat["grantsSpellAccess"] = {"realmOrDomain": f"{kind}.{slug(target)}",
                                             "maxLevel": int(m.group(1))}
            feats.append(feat)
            i = j
            continue
        i += 1
    return feats


def join_paragraph(lines: list[str]) -> str:
    text = "\n".join(clean(l) for l in lines).strip()
    # sammenføj linjeskift midt i sætninger, behold afsnit
    text = re.sub(r"(?<![.:!?])\n", " ", text)
    return text


# ---------------------------------------------------------------------------
# Spells
# ---------------------------------------------------------------------------

SPELL_HEAD = re.compile(r"^(?P<name>.+?)\s+Level (?P<level>\d+)$")
VAR_NAMES = ["range", "blast", "burst", "zone", "duration", "dmr", "intensity"]
REALMS = {"Elementalism", "Spiritualism", "Mysticism"}


def parse_var(tok: str) -> dict:
    base, _, step = tok.partition("/")
    norm = lambda s: None if s in ("-", "") else s
    return {"base": norm(base), "step": norm(step)}


def parse_spells(pages) -> list[dict]:
    lines = [(p, ln) for p, ls in pages if p >= 159 for ln in ls]
    spells, i = [], 0
    while i < len(lines):
        page, ln = lines[i]
        c = clean(ln)
        m = SPELL_HEAD.match(c)
        if (m and i + 3 < len(lines) and clean(lines[i + 1][1]).split()[:1]
                and clean(lines[i + 1][1]).split()[0] in REALMS
                and clean(lines[i + 2][1]).startswith("Range")):
            tags_line = clean(lines[i + 1][1]).split()
            realm, domain_and_tags = tags_line[0], tags_line[1:]
            domain = domain_and_tags[0]
            if domain == "Dark":  # "Dark magic"
                domain, domain_and_tags = "Dark magic", domain_and_tags[1:]
            tags = ["Concentration" if t == "Concentrate" else t for t in domain_and_tags[1:]]
            # variabel-overskriften kan være brudt over flere linjer ("Intensi" / "ty")
            k, header = i + 2, clean(lines[i + 2][1])
            while "Intensity" not in header.replace(" ", "") and k + 1 < len(lines):
                k += 1
                header += clean(lines[k][1]).split()[0] if clean(lines[k][1]) else ""
                rest = clean(lines[k][1]).split(None, 1)
                if len(rest) > 1 and "Intensity" in header:
                    lines[k] = (lines[k][0], rest[1])  # resten af linjen er værdierne
                    k -= 1
                    break
            value_line = clean(lines[k + 1][1])
            vals = re.sub(r"\s*/\s*", "/", value_line).split()
            notes = []
            if len(vals) != 7:
                notes.append(f"Kunne ikke læse spell-variabler: {value_line!r}")
                vals = (vals + ["-/-"] * 7)[:7]
            j, body = k + 2, []
            while j < len(lines):
                cj = clean(lines[j][1])
                if SPELL_HEAD.match(cj) and j + 1 < len(lines) and clean(lines[j + 1][1]).split()[:1] \
                        and clean(lines[j + 1][1]).split()[0] in REALMS:
                    break
                if re.match(r"^(Spells: |Gamemastering)", cj) or cj in (
                        "Fire", "Earth", "Water", "Air", "Warding", "Nature", "Mentalism", "Dark magic"):
                    break
                body.append(lines[j][1]); j += 1
            sp = {
                "id": f"spell.{slug(domain)}.{slug(m.group('name'))}",
                "name": m.group("name"),
                "level": int(m.group("level")),
                "realm": f"realm.{slug(realm)}",
                "domain": f"domain.{slug(domain)}",
                "tags": tags,
                "variables": {k: parse_var(v) for k, v in zip(VAR_NAMES, vals)},
                "text": join_paragraph(body),
                "source": src(page),
            }
            if notes:
                sp["reviewNotes"] = notes
            spells.append(sp)
            i = j
            continue
        i += 1
    return spells


# ---------------------------------------------------------------------------

def main(pdf: str, out_dir: str) -> None:
    pages = read_pdf(pdf)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    feats = parse_feats(pages)
    spells = parse_spells(pages)
    (out / "feats.all.json").write_text(json.dumps(feats, indent=2, ensure_ascii=False))
    (out / "spells.all.json").write_text(json.dumps(spells, indent=2, ensure_ascii=False))
    print(f"feats: {len(feats)}  spells: {len(spells)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])


# ---------------------------------------------------------------------------
# Udstyrstabeller (læses fra -layout, fordi kolonnerne skal bevares)
# ---------------------------------------------------------------------------

def read_pdf_layout(path: str, first: int, last: int) -> list[tuple[int, str]]:
    out = []
    for page in range(first, last + 1):
        raw = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", "-f", str(page), "-l", str(page),
                              path, "-"], check=True, capture_output=True).stdout.decode("utf-8")
        out += [(page, unicodedata.normalize("NFKC", ln)) for ln in raw.split("\n")]
    return out


def num(s: str) -> float | None:
    if s in ("---", "*", "-"):
        return None
    v = float(s.replace(",", "."))
    return int(v) if v.is_integer() else v


def price(s: str) -> dict | None:
    m = re.match(r"(\d+)\s*(gp|sp|bp|cp)", s)
    return {"amount": int(m.group(1)), "currency": m.group(2)} if m else None


def parse_props(s: str) -> list[dict]:
    out = []
    for part in re.split(r",\s*|\s{2,}|(?<=\))\s+(?=[A-Z])", s.strip()):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^(.+?)\s*\((.+)\)$", part)
        if m:
            p = m.group(2).strip()
            out.append({"property": f"property.{slug(m.group(1))}",
                        "param": int(p) if p.isdigit() else p})
        else:
            out.append({"property": f"property.{slug(part)}"})
    return out


MELEE_GROUPS = {"Unarmed": "unarmed", "Swords & Knives": "swords-and-knives", "Axes": "axes",
                "Clubs & Hammers": "clubs-and-hammers", "Polearms & Staffs": "polearms-and-staffs"}
RANGED_GROUPS = {"Bows": "bows", "Crossbows": "crossbows", "Thrown weaponry": "thrown-weaponry",
                 "Firearms": "firearms"}
def firearm_group(name: str) -> str:
    """Konflikt K4: tabellen har kun "Firearms"; skills skelner 1- og 2-håndet."""
    return "1-handed-firearms" if "pistol" in name.lower() else "2-handed-firearms"


MELEE_ROW = re.compile(r"^\s*(?P<name>[A-Z][\w ,'’-]*?)\s{2,}(?P<dmg>\d+|\*)\s+(?P<enc>[\d,]+|---)\s+"
                       r"(?P<str>\d+|---)\s+(?P<price>\d+ [gsbc]p|---)\s*(?P<props>.*)$")
RANGED_ROW = re.compile(r"^\s*(?P<name>[A-Z][\w ,'’-]*?)\s{2,}(?P<dmg>\d+)\s+(?P<enc>[\d,]+|---)\s+"
                        r"(?P<price>\d+ [gsbc]p)\s+(?P<str>\d+)\s+(?P<range>[SML/]+)\s+(?P<ammo>\d+)\s*(?P<props>.*)$")
ARMOR_ROW = re.compile(r"^\s*(?P<name>[A-Z][\w ’'-]*?)\s{2,}(?P<dfr>[+-]\d+)\s+(?P<tou>[+-]\d+|---)\s+"
                       r"(?P<dex>\d+|---)\s+(?P<str>\d+|---)\s+(?P<enc>[\d,]+)\s+(?P<skill>-\d+|---)\s+"
                       r"(?P<spell>-\d+|---)\s+(?P<price>\d+ [gsbc]p)\s*(?P<props>.*)$")


def parse_equipment(path: str) -> dict:
    weapons, armor = [], []
    group = None
    for page, ln in read_pdf_layout(path, 131, 134):
        head = re.match(r"^\s*([A-Z][\w &]+?)\s{2,}(DMG|DFR)\b", ln)
        if head:
            group = head.group(1).strip()
            continue
        if ln.strip() == "Shield":
            group = "Shield"
            continue
        if group in MELEE_GROUPS and (m := MELEE_ROW.match(ln)):
            weapons.append({
                "id": f"weapon.{slug(m['name'])}", "name": m["name"].strip(), "kind": "melee",
                "group": f"skill.combat-melee-{MELEE_GROUPS[group]}",
                "dmg": num(m["dmg"]), "enc": num(m["enc"]), "str": num(m["str"]),
                "price": price(m["price"]), "properties": parse_props(m["props"]),
                "text": "", "source": src(page, "Melee weapons")})
        elif group in RANGED_GROUPS and (m := RANGED_ROW.match(ln)):
            weapons.append({
                "id": f"weapon.{slug(m['name'])}", "name": m["name"].strip(), "kind": "ranged",
                "group": f"skill.combat-ranged-{firearm_group(m['name']) if group == 'Firearms' else RANGED_GROUPS[group]}",
                "dmg": num(m["dmg"]), "enc": num(m["enc"]), "str": num(m["str"]),
                "range": m["range"], "ammo": int(m["ammo"]),
                "price": price(m["price"]), "properties": parse_props(m["props"]),
                "text": "", "source": src(page, "Ranged weapons")})
        elif group in ("Light", "Medium", "Heavy", "Shield") and (m := ARMOR_ROW.match(ln)):
            name = m["name"].strip()
            if group == "Shield":
                name = f"Shield ({name.lower()})"
            armor.append({
                "id": f"armor.{slug(name)}", "name": name,
                "armorClass": group.lower(),
                "dfr": int(m["dfr"]), "tou": num(m["tou"].lstrip("+")) or 0,
                "dexCap": num(m["dex"]), "str": num(m["str"]), "enc": num(m["enc"]),
                "skillPenalty": num(m["skill"]) or 0, "spellPenalty": num(m["spell"]) or 0,
                "price": price(m["price"]), "properties": parse_props(m["props"]),
                "text": "", "source": src(page, "Armor & Shields")})
    return {"weapons": weapons, "armor": armor}


# ---------------------------------------------------------------------------
# Skills (s. 96-125)
# ---------------------------------------------------------------------------

SKILL_HEAD = re.compile(r"^(?P<name>[A-Z][\w &:]+?) \((?P<attr>STR|CON|DEX|INT|WIS|CHA)\)$")
MELEE_CATEGORIES = ["Unarmed", "Swords & Knives", "Axes", "Clubs & Hammers", "Polearms & Staffs"]
RANGED_CATEGORIES = ["Bows", "Crossbows", "Thrown weaponry", "Grenades", "1-handed firearms",
                     "2-handed firearms"]
# Bogen nævner ikke, hvilke skills rammes af "maneuver"-straf – udkast til beslutning:
MANEUVER_SKILLS = {"Acrobatics & Athletics", "Stalking & Hiding", "Sleight of hands & Trickery",
                   "Mechanics & Machinery"}


def parse_skills(pages) -> list[dict]:
    lines = [(p, ln) for p, ls in pages if 96 <= p <= 125 for ln in ls]
    blocks, cur = [], None
    for page, ln in lines:
        c = clean(ln)
        if c.startswith("Determine the skill check bonus"):
            break
        m = SKILL_HEAD.match(c)
        if m:
            cur = {"name": m["name"], "attr": m["attr"], "page": page, "lines": []}
            blocks.append(cur)
        elif cur:
            cur["lines"].append(ln)
    skills = []
    for b in blocks:
        body, subs, sub = [], [], None
        for ln in b["lines"]:
            c = clean(ln)
            if c.startswith("Subskill:"):
                sub = {"name": c.split(":", 1)[1].strip(), "lines": []}
                subs.append(sub)
            elif sub:
                sub["lines"].append(ln)
            else:
                body.append(ln)
        text = join_paragraph(body)
        subskills = [{"name": s["name"], "text": join_paragraph(s["lines"])} for s in subs]
        name = b["name"]
        base = {"attribute": b["attr"], "subskills": subskills, "source": src(b["page"], "Skills")}
        if name.startswith("Combat: "):
            kind = "Melee" if "Melee" in name else "Ranged"
            cats = MELEE_CATEGORIES if kind == "Melee" else RANGED_CATEGORIES
            for cat in cats:
                skills.append({**base, "id": f"skill.combat-{kind.lower()}-{slug(cat)}",
                               "name": f"Combat: {kind} – {cat}", "family": name,
                               "category": f"combat{kind}", "armorPenalty": "none",
                               "text": text, "subskills": []})
        elif name.startswith("Magic: "):
            skills.append({**base, "id": f"skill.{slug(name)}", "name": name, "category": "magic",
                           "armorPenalty": "magic", "text": text,
                           "aliases": [name.replace("Magic: ", "Casting: "), name.replace("Magic: ", "")]})
        else:
            sk = {**base, "id": f"skill.{slug(name)}", "name": name, "category": "general",
                  "armorPenalty": "maneuver" if name in MANEUVER_SKILLS else "none", "text": text}
            if name in MANEUVER_SKILLS:
                sk["clarifications"] = ["Husfortolkning: maneuver skill – rammes af rustningens maneuver-straf."]
            skills.append(sk)
    # Konflikt K3: armor-skills bruges i DFR og backgrounds, men er ikke defineret i bogen
    for grp in ("Light", "Medium", "Heavy"):
        skills.append({"id": f"skill.armor-{grp.lower()}", "name": f"Armor: {grp}", "attribute": None,
                       "category": "armor", "family": "Armor", "armorPenalty": "none", "subskills": [],
                       "text": f"Training in {grp.lower()} armor. The skill bonus is added to DFR "
                               f"when wearing {grp.lower()} armor.",
                       "source": src(17, "Defense (DFR)"),
                       "clarifications": ["Husfortolkning: bogen definerer ikke armor-skills. Ingen "
                                          "tilknyttet attribut – bonus = rank-bonus."]})
    return skills


# ---------------------------------------------------------------------------
# Backgrounds (s. 90-96)
# ---------------------------------------------------------------------------

def skill_ref(name: str, skills: list[dict]) -> tuple[object, str | None]:
    n = clean(name).strip()
    m = re.match(r"(Weapon|Armor) #(\d)", n)
    if m:
        return {"slot": m.group(1).lower(), "index": int(m.group(2))}, None
    for s in skills:
        if s["name"].lower() == n.lower() or n.lower() in [a.lower() for a in s.get("aliases", [])]:
            return s["id"], None
    return f"skill.{slug(n)}", f"Ukendt skill: {n!r}"


def parse_backgrounds(pdf_path, skills, feats) -> list[dict]:
    # layout-tekst, fordi blanke linjer adskiller navn/flavor/benefit/ranks
    lines = [(p, clean(ln)) for p, ln in read_pdf_layout(pdf_path, 90, 96)
             if not re.match(r"\s*Page \d+ af \d+", ln)]
    feat_by_name = {}
    for f in feats:
        for n in [f["name"], *f.get("aliases", [])]:
            feat_by_name[n.lower().replace(" ", "")] = f["id"]
    out = []
    for i, (page, ln) in enumerate(lines):
        if not ln.startswith("Benefit:"):
            continue
        k = i - 1
        while k > 0 and not lines[k][1]:
            k -= 1           # spring blanke linjer over
        while k > 0 and lines[k - 1][1]:
            k -= 1           # gå til starten af flavor-blokken
        name = lines[k][1]
        flavor = join_paragraph([l for _, l in lines[k + 1:i] if l])
        j, benefit_txt = i + 1, ln[len("Benefit:"):].strip()
        while j < len(lines) and lines[j][1] and not lines[j][1].startswith("Skill rank"):
            benefit_txt += " " + lines[j][1]; j += 1
        while j < len(lines) and not lines[j][1].startswith("Skill rank"):
            j += 1
        j += 1
        ranks_txt = ""
        while j < len(lines) and lines[j][1]:
            ranks_txt += " " + lines[j][1]; j += 1
        notes = []
        m = re.match(r"Free feat (.+?)\.?$", benefit_txt)
        if m:
            fid = feat_by_name.get(m.group(1).strip().lower().replace(" ", ""))
            if not fid:
                notes.append(f"Feat findes ikke med dette navn: {m.group(1)!r}")
                fid = f"feat.universal.{slug(m.group(1))}"
            benefit = {"kind": "feat", "feat": fid}
        elif sm := re.search(r"social standing of at least (\d+)", benefit_txt):
            benefit = {"kind": "socialStanding", "min": int(sm.group(1))}
        else:
            benefit = {"kind": "text", "text": benefit_txt}
        sr = []
        for part in re.split(r"[;,]\s*", ranks_txt.strip().rstrip(".")):
            pm = re.match(r"(.+?)\s*\((\d+)\)", part.strip())
            if pm:
                ref, note = skill_ref(pm.group(1), skills)
                if note:
                    notes.append(note)
                sr.append({"skill": ref, "ranks": int(pm.group(2))})
        bg = {"id": f"background.{slug(name)}", "name": name, "text": flavor, "benefit": benefit,
              "skillRanks": sr, "source": src(lines[k][0], "Backgrounds")}
        if notes:
            bg["reviewNotes"] = notes
        out.append(bg)
    return out


# ---------------------------------------------------------------------------
# Egenskaber for våben og rustning (s. 131-133)
# ---------------------------------------------------------------------------

PROP_LINE = re.compile(r"^(?P<name>[A-Z][\w -]+?)(?P<param> ?\((x|X)\))?: (?P<text>.+)$")


def parse_properties(pdf_path) -> list[dict]:
    out, cur, applies = {}, None, "melee"
    for page, ln in read_pdf_layout(pdf_path, 131, 133):
        c = clean(ln)
        if c.startswith("Armor properties"):
            applies = "armor"
        elif c.startswith("Shield properties"):
            applies = "shield"
        elif c.startswith("Melee weapon properties"):
            applies = "melee"
        elif c.startswith("Ranged weapon properties"):
            applies = "ranged"
        m = PROP_LINE.match(c)
        if m and len(m["name"]) < 30:
            pid = f"property.{slug(m['name'])}"
            if pid in out:   # fx Unreliable står både under melee og ranged
                cur = None
                continue
            cur = {"id": pid, "name": m["name"], "appliesTo": applies,
                   "param": "number" if m["param"] else "none", "text": m["text"],
                   "source": src(page, "Equipment")}
            out[pid] = cur
        elif cur and c and not c.isupper() and not c.startswith(("Page ", "Ranged", "RANGED", "Bows")):
            cur["text"] += " " + c
        elif not c:
            cur = None
    return list(out.values())
