"""
Byg regelpakken: maskinelt udtræk + manuel kuratering -> data/rules/<version>/

    python3 -I tools/import/build_rules.py <regelbog.pdf>

Skriver:
Kuratering: data/curation/*.json (én fil pr. kategori).

  data/rules/<version>/rules.json         – hele pakken (RulesPackage)
  data/rules/<version>/rules.sample.json  – prøveudsnit til review
  docs/import-report.md                   – tal, brudte referencer og reviewNotes
"""
from __future__ import annotations

import datetime as dt
import fnmatch
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import extract as ex  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def apply_curation(items: list[dict], overlay: dict) -> None:
    by_id = {i["id"]: i for i in items}
    for fid, patch in overlay.items():
        if fid not in by_id:
            raise SystemExit(f"Kuratering refererer til ukendt ID: {fid}")
        item = by_id[fid]
        for k, v in patch.items():
            if k in ("reviewNotes", "clarifications"):
                item.setdefault(k, []).extend(v)
            else:
                item[k] = v


def check_refs(pkg: dict) -> list[str]:
    """Find referencer, der ikke peger på noget."""
    ids = {e["id"] for key in ("ancestries", "archetypes", "feats", "backgrounds", "skills",
                               "properties", "weapons", "armor", "spells") for e in pkg[key]}
    problems = []

    def need(ref: str, where: str) -> None:
        if ref.startswith("$choice.") or ref == "all":
            return
        if "*" in ref:
            if not any(fnmatch.fnmatch(i, ref) for i in ids):
                problems.append(f"{where}: mønster `{ref}` matcher intet")
        elif ref not in ids:
            problems.append(f"{where}: `{ref}` findes ikke")

    for f in pkg["feats"]:
        need(f["group"], f["id"])
        for p in f["prerequisites"]:
            if p["kind"] == "feat":
                need(p["feat"], f["id"])
        if "grantsSpellAccess" in f:
            ref = f["grantsSpellAccess"]["realmOrDomain"]
            kind, name = ref.split(".", 1)
            if not any(sp[kind] == ref for sp in pkg["spells"]):
                problems.append(f"{f['id']}: `{ref}` har ingen spells")
        for m in f["modifiers"]:
            if m["target"]["kind"] == "skill":
                need(m["target"]["skill"], f["id"])
    for b in pkg["backgrounds"]:
        if b["benefit"]["kind"] == "feat":
            need(b["benefit"]["feat"], b["id"])
        for r in b["skillRanks"]:
            if isinstance(r["skill"], str):
                need(r["skill"], b["id"])
    for w in pkg["weapons"]:
        need(w["group"], w["id"])
        for p in w["properties"]:
            need(p["property"], w["id"])
    for a in pkg["armor"]:
        for p in a["properties"]:
            need(p["property"], a["id"])
    return problems


def main(pdf: str) -> None:
    cdir = ROOT / "data/curation"
    load = lambda name: {k: v for k, v in json.loads((cdir / name).read_text()).items()
                         if not k.startswith("_")}
    progression = load("progression.json")
    pages = ex.read_pdf(pdf)

    feats = ex.parse_feats(pages)
    apply_curation(feats, load("feats.json")["overrides"])
    spells = ex.parse_spells(pages)
    apply_curation(spells, load("spells.json")["overrides"])
    skills = ex.parse_skills(pages)
    equipment = ex.parse_equipment(pdf)
    properties = ex.parse_properties(pdf)
    known = {p["id"] for p in properties}
    properties += [p for p in load("properties.json")["additions"] if p["id"] not in known]

    pkg = {
        "meta": {"book": "core", "version": ex.BOOK_VERSION,
                 "importedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                 "sourceFile": Path(pdf).name},
        "progression": {**progression, "levels": levels()},
        "ancestries": load("ancestries.json")["items"],
        "archetypes": load("archetypes.json")["items"],
        "feats": feats,
        "backgrounds": ex.parse_backgrounds(pdf, skills, feats),
        "skills": skills,
        "properties": properties,
        "weapons": equipment["weapons"],
        "armor": equipment["armor"],
        "spells": spells,
    }
    problems = check_refs(pkg)

    out = ROOT / "data/rules" / ex.BOOK_VERSION
    out.mkdir(parents=True, exist_ok=True)
    (out / "rules.json").write_text(json.dumps(pkg, indent=2, ensure_ascii=False))

    sample_ids = load("sample.json")
    sample = {**pkg}
    for key, wanted in sample_ids.items():
        by_id = {e["id"]: e for e in pkg[key]}
        missing = [w for w in wanted if w not in by_id]
        if missing:
            raise SystemExit(f"Sample-ID'er findes ikke i {key}: {missing}")
        sample[key] = [by_id[w] for w in wanted]
    (out / "rules.sample.json").write_text(json.dumps(sample, indent=2, ensure_ascii=False))

    write_report(pkg, problems)
    print({k: len(v) for k, v in pkg.items() if isinstance(v, list)}, f"problemer: {len(problems)}")


def levels() -> list[dict]:
    """Level-tabellen s. 129: mønstret gentager sig hver 4. level fra 2 til 40."""
    out = []
    for lvl in range(2, 41):
        if lvl % 2 == 0:
            out.append({"level": lvl, "feats": 1})
        elif lvl % 4 == 3:
            out.append({"level": lvl, "bpOrMp": 5, "saveProficiencyPoints": 2})
        else:
            out.append({"level": lvl, "attributePoints": 2})
    return out


def write_report(pkg: dict, problems: list[str]) -> None:
    lines = [f"# Import-rapport – regelbog {pkg['meta']['version']}", "",
             f"Genereret {pkg['meta']['importedAt']} fra `{pkg['meta']['sourceFile']}`.", "",
             "| Kategori | Antal |", "|---|---|"]
    for k in ("ancestries", "archetypes", "feats", "backgrounds", "skills", "properties",
              "weapons", "armor", "spells"):
        lines.append(f"| {k} | {len(pkg[k])} |")
    feats = pkg["feats"]
    lines += ["", "## Feats", "",
              f"- Med handlingsikon: {sum(1 for f in feats if f['action'])}",
              f"- Med BP/MP-pris: {sum(1 for f in feats if f.get('cost'))}",
              f"- Med forudsætning, der ikke kan tjekkes automatisk: "
              f"{sum(1 for f in feats if any(p['kind'] == 'text' for p in f['prerequisites']))}",
              f"- Med maskinlæsbare modifiers (kurateret): {sum(1 for f in feats if f['modifiers'])}",
              "", "## Brudte referencer", ""]
    lines += [f"- {p}" for p in problems] or ["Ingen."]
    lines += ["", "## Husfortolkninger (vises i appen)", ""]
    for key in ("ancestries", "feats", "backgrounds", "skills", "properties", "spells"):
        n = [e for e in pkg[key] if e.get("clarifications")]
        if n:
            lines.append(f"- {key}: {len(n)}")
    lines += ["", "## Review-noter fra importen", ""]
    for key in ("ancestries", "feats", "backgrounds", "skills", "spells"):
        for e in pkg[key]:
            for n in e.get("reviewNotes", []):
                lines.append(f"- `{e['id']}` (s. {e['source']['page']}): {n}")
    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs/import-report.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
