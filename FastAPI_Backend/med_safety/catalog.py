"""Medicine catalogue: hand-checked ingredients, brand names and interaction rules (knowledge/*.json),
plus name matching that copes with prescription text like "Tab. Thyronorm 50 mcg OD" or "Orofer-XT"."""

from __future__ import annotations

import difflib
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"

TIERS = ("generally_used", "caution", "avoid")
TIER_RANK = {"generally_used": 0, "unknown": 1, "caution": 2, "avoid": 3}

# Words that describe the form or dosing, not the medicine. Removed before matching.
FORM_WORDS = {
    "tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules", "syp", "syrup", "susp",
    "suspension", "inj", "injection", "oint", "ointment", "cream", "gel", "drops", "drop", "sachet", "soln",
    "solution", "inhaler", "rotacap", "rotacaps", "respules", "pessary", "vaginal", "oral", "ip", "usp", "bp",
    "mg", "mcg", "ml", "iu", "gm", "g", "units", "od", "bd", "bid", "tds", "tid", "qid", "hs", "sos", "prn",
    "once", "twice", "thrice", "daily", "a", "day", "at", "night", "morning", "after", "before", "food",
    "meals", "meal", "with", "for", "days", "weeks", "x", "take", "dose", "doses", "1", "2", "3", "4",
}

_DOSE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|gm|iu)\b", re.I)


def normalize(text: str) -> str:
    t = text.lower().replace("®", " ").replace("™", " ")
    t = re.sub(r"[^a-z0-9.' ]+", " ", t)
    t = re.sub(r"(?<=[a-z])\.(?=\s|$)", " ", t)  # "tab." -> "tab"
    return re.sub(r"\s+", " ", t).strip()


def strip_noise(norm: str) -> str:
    words = [w for w in norm.split() if w not in FORM_WORDS and not re.fullmatch(r"\d+(\.\d+)?(mg|mcg|ml|iu|g|k)?", w)]
    return " ".join(words)


def dose_mg(text: str) -> Optional[float]:
    m = _DOSE_RE.search(text or "")
    if not m:
        return None
    value, unit = float(m.group(1)), m.group(2).lower()
    if unit in ("g", "gm"):
        return value * 1000
    if unit in ("mcg", "µg", "ug"):
        return value / 1000
    if unit == "iu":
        return None
    return value


@dataclass
class Ingredient:
    id: str
    name: str
    synonyms: List[str]
    classes: List[str]
    pregnancy: Dict[str, str]
    note: str
    source: str
    from_month: Dict[int, str] = field(default_factory=dict)
    timing: Dict[str, object] = field(default_factory=dict)
    dont_stop: bool = False
    low_dose_max_mg: Optional[float] = None
    low_dose: Optional[dict] = None
    max_daily_mg: Optional[float] = None

    def tier_for_month(self, month: int, low_dose: bool = False) -> str:
        preg = self.low_dose["pregnancy"] if (low_dose and self.low_dose) else self.pregnancy
        tier = preg.get(trimester_key(month), "caution")
        if not (low_dose and self.low_dose):
            for start in sorted(self.from_month):
                if month >= start and TIER_RANK[self.from_month[start]] > TIER_RANK[tier]:
                    tier = self.from_month[start]
        return tier


@dataclass
class Product:
    name: str
    aliases: List[str]
    ingredients: List[str]
    dose_mg: Optional[float] = None


@dataclass
class Match:
    input: str
    kind: str  # "product" | "ingredient" | "combination"
    label: str
    ingredient_ids: List[str]
    confidence: str  # "exact" | "fuzzy"
    matched_alias: str
    product_dose_mg: Optional[float] = None


def trimester_key(month: int) -> str:
    return "t1" if month <= 3 else "t2" if month <= 6 else "t3"


class Catalog:
    def __init__(self, directory: Path = KNOWLEDGE_DIR):
        ing = json.loads((directory / "ingredients.json").read_text())["ingredients"]
        prod = json.loads((directory / "products.json").read_text())["products"]
        inter = json.loads((directory / "interactions.json").read_text())
        self.ingredients: Dict[str, Ingredient] = {}
        for raw in ing:
            self.ingredients[raw["id"]] = Ingredient(
                id=raw["id"],
                name=raw["name"],
                synonyms=raw.get("synonyms", []),
                classes=raw.get("classes", []),
                pregnancy=raw["pregnancy"],
                note=raw.get("note", ""),
                source=raw.get("source", ""),
                from_month={int(k): v for k, v in raw.get("from_month", {}).items()},
                timing=raw.get("timing", {}),
                dont_stop=bool(raw.get("dont_stop")),
                low_dose_max_mg=raw.get("low_dose_max_mg"),
                low_dose=raw.get("low_dose"),
                max_daily_mg=raw.get("max_daily_mg"),
            )
        self.products = [Product(p["name"], p.get("aliases", []), p["ingredients"], p.get("dose_mg")) for p in prod]
        self.interactions = inter["interactions"]
        self.duplicate_classes: Dict[str, str] = inter.get("duplicate_classes", {})

        # alias -> (kind, key). Ingredient names win over brand aliases with the same text.
        self.index: Dict[str, Tuple[str, str]] = {}
        for p_i, p in enumerate(self.products):
            for alias in [p.name, *p.aliases]:
                self.index.setdefault(normalize(alias), ("product", str(p_i)))
        for ing_obj in self.ingredients.values():
            for alias in [ing_obj.id.replace("_", " "), ing_obj.name, *ing_obj.synonyms]:
                key = normalize(re.sub(r"\(.*?\)", "", alias))
                if key:
                    self.index[key] = ("ingredient", ing_obj.id)
        self._keys_by_len = sorted(self.index, key=len, reverse=True)
        self._fuzzy_keys = [k for k in self.index if len(k) >= 5]

    # ---------------------------------------------------------------- matching

    def _match_key(self, key: str, text: str, confidence: str, dose: Optional[float]) -> Match:
        kind, ref = self.index[key]
        if kind == "product":
            p = self.products[int(ref)]
            return Match(text, "product", p.name, list(p.ingredients), confidence, key, p.dose_mg if dose is None else dose)
        ing_obj = self.ingredients[ref]
        return Match(text, "ingredient", ing_obj.name, [ing_obj.id], confidence, key, dose)

    def resolve(self, text: str) -> Optional[Match]:
        """Best match for one line of a prescription, or None."""
        if not text or not text.strip():
            return None
        norm = normalize(text)
        dose = dose_mg(text)
        cleaned = strip_noise(norm)
        for candidate in (norm, cleaned):
            if candidate in self.index:
                return self._match_key(candidate, text, "exact", dose)

        # Combinations written out: "amoxicillin + clavulanic acid", "paracetamol/ibuprofen".
        parts = [p for p in re.split(r"\s*(?:\+|/|&|\band\b|\bwith\b)\s*", text.lower()) if p.strip()]
        if len(parts) > 1:
            found = [self.resolve(p) for p in parts]
            if all(found):
                ids = list(dict.fromkeys(i for m in found for i in m.ingredient_ids))
                return Match(text, "combination", " + ".join(m.label for m in found), ids, "exact" if all(m.confidence == "exact" for m in found) else "fuzzy", "+".join(m.matched_alias for m in found), dose)

        # A known name inside longer text ("tab thyronorm 50 mcg"): longest whole-word match wins.
        padded = f" {cleaned} "
        for key in self._keys_by_len:
            if len(key) >= 3 and f" {key} " in padded:
                return self._match_key(key, text, "exact", dose)

        # Typos: compare whole cleaned text, then each longer word.
        for candidate in [cleaned, *[w for w in cleaned.split() if len(w) >= 5]]:
            if len(candidate) < 5:
                continue
            close = difflib.get_close_matches(candidate, self._fuzzy_keys, n=1, cutoff=0.85)
            if close:
                return self._match_key(close[0], text, "fuzzy", dose)
        return None

    def search(self, query: str, limit: int = 8) -> List[dict]:
        """Autocomplete: brand and generic names starting with / containing the query, then close spellings."""
        q = normalize(query)
        if len(q) < 2:
            return []
        starts = [k for k in self.index if k.startswith(q)]
        contains = [k for k in self.index if q in k and not k.startswith(q)]
        close = difflib.get_close_matches(q, self._fuzzy_keys, n=limit, cutoff=0.75) if len(q) >= 4 else []
        out, seen = [], set()
        for key in sorted(starts, key=len) + sorted(contains, key=len) + close:
            kind, ref = self.index[key]
            if (kind, ref) in seen:
                continue
            seen.add((kind, ref))
            if kind == "product":
                p = self.products[int(ref)]
                names = ", ".join(self.ingredients[i].name.split(" (")[0] for i in p.ingredients)
                out.append({"name": p.name, "kind": "product", "detail": names, "ingredients": p.ingredients})
            else:
                ing_obj = self.ingredients[ref]
                label = key.title() if key != normalize(ing_obj.name) else ing_obj.name
                out.append({"name": label, "kind": "ingredient", "detail": ing_obj.name, "ingredients": [ing_obj.id]})
            if len(out) >= limit:
                break
        return out


@lru_cache(maxsize=1)
def get_catalog() -> Catalog:
    return Catalog()
