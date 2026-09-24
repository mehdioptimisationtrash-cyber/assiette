"""Convertit la table CIQUAL 2020 (ANSES, .xls) en JSON compact pour l'app.

Usage : python3 tools/build_ciqual.py
Entrée : tools/raw/ciqual2020.xls  —  Sortie : data/ciqual.json
"""
import json
import re
from pathlib import Path

import xlrd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "raw" / "ciqual2020.xls"
OUT = ROOT / "data" / "ciqual.json"

# clé courte -> index(s) de colonne dans la table (premier non vide gagne)
COLUMNS = {
    "kcal": [10, 12],
    "p": [14, 15],
    "c": [16],
    "f": [17],
    "sug": [18],
    "fib": [26],
    "sat": [31],
    "salt": [49],
    "alc": [29],
    "ca": [50],
    "fe": [53],
    "mg": [55],
    "k": [58],
    "na": [60],
    "vc": [68],
    "vd": [64],
    "b9": [74],
    "b12": [75],
}
FIELDS = list(COLUMNS)


def parse(value):
    """'12,5' -> 12.5 ; '< 0,5' -> 0.25 ; 'traces' -> 0 ; '-' ou '' -> None."""
    if isinstance(value, float):
        return value
    text = str(value).strip().lower().replace(",", ".")
    if text in ("", "-"):
        return None
    if text == "traces":
        return 0.0
    match = re.search(r"\d+(\.\d+)?", text)
    if not match:
        return None
    number = float(match.group())
    return number / 2 if text.startswith("<") else number


def estimate_kcal(n):
    """Énergie UE 1169/2011 recalculée depuis les macros si la table ne la donne pas."""
    if n["p"] is None or n["c"] is None or n["f"] is None:
        return None
    kcal = 4 * n["p"] + 4 * n["c"] + 9 * n["f"] + 7 * (n["alc"] or 0) + 2 * (n["fib"] or 0)
    return round(kcal, 1)


def round_value(v):
    if v is None:
        return None
    return round(v, 1) if v >= 1 else round(v, 3)


def main():
    sheet = xlrd.open_workbook(str(SRC)).sheet_by_index(0)
    foods = []
    for r in range(1, sheet.nrows):
        row = sheet.row_values(r)
        values = []
        for key in FIELDS:
            v = None
            for col in COLUMNS[key]:
                v = parse(row[col])
                if v is not None:
                    break
            values.append(round_value(v))
        if values[0] is None:
            values[0] = estimate_kcal(dict(zip(FIELDS, values)))
        if values[0] is None:  # ni énergie ni macros : inutilisable
            continue
        group = row[4] or row[3]
        foods.append([int(row[6]), row[7].strip(), group.strip()] + values)
    payload = {
        "source": "ANSES — Table de composition nutritionnelle Ciqual 2020",
        "fields": ["id", "name", "group"] + FIELDS,
        "foods": foods,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(foods)} aliments -> {OUT} ({OUT.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
