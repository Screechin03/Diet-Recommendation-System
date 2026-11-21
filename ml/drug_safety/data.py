"""Dataset loaders. Each accepts the published file formats as-is, so files can be dropped into data/ unchanged.

Interaction pairs (TWOSIDES / BIOSNAP / DrugBank DDI) -> DataFrame[a, b, relation]
  * TDC exports (TWOSIDES, DrugBank DDI):   Drug1_ID, Drug1 (SMILES), Drug2_ID, Drug2 (SMILES), Y
  * nSIDES TWOSIDES.csv:                     drug_1_concept_name, drug_2_concept_name, condition_concept_name, ...
  * Decagon bio-decagon-combo.csv:            STITCH 1, STITCH 2, Polypharmacy Side Effect, Side Effect Name
  * BIOSNAP ChCh-Miner (.tsv, no header):     two DrugBank ids per line
Drug table -> DataFrame[id, name, synonyms(list), smiles]
  * simple drugs.csv: id, name, synonyms ("a|b|c"), smiles
  * DrugBank open vocabulary: "DrugBank ID", "Common name", "Synonyms" (+ optional SMILES column)
Pregnancy labels -> {drug name: {tier, category, source, evidence}}
  * openFDA drug label JSON (download from open.fda.gov, unzip): {"results": [{"openfda": {...}, "pregnancy": [...]}]}
  * the app's hand-checked knowledge base (FastAPI_Backend/med_safety/knowledge/ingredients.json)
"""

from __future__ import annotations

import glob
import json
import re
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd

REPO = Path(__file__).resolve().parents[2]
KNOWLEDGE = REPO / "FastAPI_Backend" / "med_safety" / "knowledge" / "ingredients.json"
TIERS = ["generally_used", "caution", "avoid"]


def norm(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", str(name).lower())).strip()


# ------------------------------------------------------------------------------------------- interactions

def load_pairs(path: Path, max_rows: Optional[int] = None) -> Tuple[pd.DataFrame, Dict[str, str]]:
    """Returns (pairs[a, b, relation], smiles_by_id). Self-pairs and duplicates are removed; pairs are unordered."""
    path = Path(path)
    smiles: Dict[str, str] = {}
    if path.suffix in (".tsv", ".txt") and _headerless(path):
        df = pd.read_csv(path, sep="\t", header=None, usecols=[0, 1], names=["a", "b"], nrows=max_rows, comment="#")
        df["relation"] = "interacts"
    else:
        sep = "\t" if path.suffix == ".tsv" else ","
        head = pd.read_csv(path, sep=sep, nrows=0).columns
        cols = {c.lower().strip(): c for c in head}
        if {"drug1_id", "drug2_id"} <= cols.keys():
            usecols = [cols["drug1_id"], cols["drug2_id"]] + [cols[c] for c in ("drug1", "drug2", "y") if c in cols]
            raw = pd.read_csv(path, sep=sep, usecols=usecols, nrows=max_rows)
            df = pd.DataFrame({"a": raw[cols["drug1_id"]].astype(str), "b": raw[cols["drug2_id"]].astype(str)})
            df["relation"] = raw[cols["y"]].astype(str) if "y" in cols else "interacts"
            for id_col, smi_col in (("drug1_id", "drug1"), ("drug2_id", "drug2")):
                if smi_col in cols:
                    smiles.update(dict(zip(raw[cols[id_col]].astype(str), raw[cols[smi_col]].astype(str))))
        elif {"drug_1_concept_name", "drug_2_concept_name"} <= cols.keys():
            rel = cols.get("condition_concept_name")
            usecols = [cols["drug_1_concept_name"], cols["drug_2_concept_name"]] + ([rel] if rel else [])
            raw = pd.read_csv(path, sep=sep, usecols=usecols, nrows=max_rows)
            df = pd.DataFrame({"a": raw[cols["drug_1_concept_name"]].map(norm), "b": raw[cols["drug_2_concept_name"]].map(norm)})
            df["relation"] = raw[rel].astype(str) if rel else "interacts"
        elif {"stitch 1", "stitch 2"} <= cols.keys():
            rel = cols.get("side effect name") or cols.get("polypharmacy side effect")
            raw = pd.read_csv(path, sep=sep, nrows=max_rows)
            df = pd.DataFrame({"a": raw[cols["stitch 1"]].astype(str), "b": raw[cols["stitch 2"]].astype(str)})
            df["relation"] = raw[rel].astype(str) if rel else "interacts"
        else:
            raise ValueError(f"Unrecognised interaction file format: {path.name} (columns: {list(head)[:8]})")
    df = df[df["a"] != df["b"]].copy()
    lo = df[["a", "b"]].min(axis=1)
    hi = df[["a", "b"]].max(axis=1)
    df["a"], df["b"] = lo, hi
    return df.drop_duplicates(["a", "b", "relation"]).reset_index(drop=True), smiles


def _headerless(path: Path) -> bool:
    first = path.open().readline()
    return bool(re.match(r"^(DB\d+|CID\d+)\s", first))


def top_relations(pairs: pd.DataFrame, k: int) -> List[str]:
    return pairs["relation"].value_counts().index[:k].tolist()


# ------------------------------------------------------------------------------------------- drugs

def load_drugs(path: Optional[Path]) -> pd.DataFrame:
    if not path or not Path(path).exists():
        return pd.DataFrame(columns=["id", "name", "synonyms", "smiles"])
    raw = pd.read_csv(path)
    cols = {c.lower().strip(): c for c in raw.columns}
    id_col = cols.get("id") or cols.get("drugbank id") or cols.get("drug_id")
    name_col = cols.get("name") or cols.get("common name")
    syn_col = cols.get("synonyms")
    smi_col = cols.get("smiles")
    out = pd.DataFrame({
        "id": raw[id_col].astype(str),
        "name": raw[name_col].astype(str) if name_col else raw[id_col].astype(str),
        "synonyms": raw[syn_col].fillna("").map(lambda s: [x.strip() for x in re.split(r"[|;]", str(s)) if x.strip()]) if syn_col else [[] for _ in range(len(raw))],
        "smiles": raw[smi_col].astype(str) if smi_col else "",
    })
    return out.drop_duplicates("id")


# ------------------------------------------------------------------------------------------- pregnancy labels

CATEGORY_TIER = {"A": "generally_used", "B": "generally_used", "C": "caution", "D": "avoid", "X": "avoid"}
_CAT_RE = re.compile(r"pregnancy\s+category\s*[:\-]?\s*\(?([ABCDX])\)?\b", re.I)
_AVOID_RE = re.compile(r"contraindicated in (women who are or may become )?pregnan|can cause fetal harm.*contraindicated|is contraindicated during pregnancy", re.I)


def label_tier_from_text(text: str) -> Optional[dict]:
    """Tier from one drug label's pregnancy section: the pre-2015 letter if present, else clear contraindication text."""
    m = _CAT_RE.search(text)
    if m:
        cat = m.group(1).upper()
        return {"tier": CATEGORY_TIER[cat], "category": cat, "source": f"FDA drug label (pre-2015 pregnancy category {cat})"}
    if _AVOID_RE.search(text):
        return {"tier": "avoid", "category": None, "source": "FDA drug label (contraindicated in pregnancy)"}
    return None


def load_openfda_labels(paths: Iterable[Path]) -> Dict[str, dict]:
    """{normalised generic name: tier info}. When labels disagree, the most cautious tier wins."""
    out: Dict[str, dict] = {}
    rank = {t: i for i, t in enumerate(TIERS)}
    for path in paths:
        data = json.loads(Path(path).read_text())
        for rec in data.get("results", []):
            text = " ".join(" ".join(rec.get(k, [])) for k in ("pregnancy", "teratogenic_effects", "pregnancy_or_breast_feeding", "use_in_specific_populations"))
            if not text.strip():
                continue
            info = label_tier_from_text(text)
            if not info:
                continue
            snippet = text[:240]
            names = rec.get("openfda", {}).get("generic_name", []) + rec.get("openfda", {}).get("substance_name", [])
            for name in names:
                for part in re.split(r"\s+and\s+|,", name):
                    key = norm(part)
                    if not key:
                        continue
                    prev = out.get(key)
                    if prev is None or rank[info["tier"]] > rank[prev["tier"]]:
                        out[key] = {**info, "evidence": snippet}
    return out


def load_curated_labels() -> Dict[str, dict]:
    """Hand-checked tiers from the app's knowledge base (worst trimester), keyed by every synonym."""
    out: Dict[str, dict] = {}
    rank = {t: i for i, t in enumerate(TIERS)}
    for ing in json.loads(KNOWLEDGE.read_text())["ingredients"]:
        worst = max(ing["pregnancy"].values(), key=lambda t: rank[t])
        for name in [ing["id"].replace("_", " "), *ing.get("synonyms", [])]:
            out[norm(name)] = {"tier": worst, "category": None, "source": "MamaCare hand-checked list"}
    return out


def find_files(directory: Path, patterns: Iterable[str]) -> List[Path]:
    hits: List[Path] = []
    for pat in patterns:
        hits += [Path(p) for p in glob.glob(str(Path(directory) / pat))]
    return sorted(set(hits))
