"""The trained graph model, served without PyTorch.

`ml/drug_safety/export.py` writes these files into med_safety/model/:
  meta.json          drugs (names, synonyms), decoder type, decision threshold, test metrics
  embeddings.npz     node embeddings + decoder weights (+ per-drug pregnancy-risk probabilities)
  label_tiers.json   pregnancy tier read from FDA drug labels (older A/B/C/D/X categories, label text)

If the files aren't there the checker simply runs on the hand-checked knowledge only.
Model output is only ever shown as an unverified signal; label tiers are shown as "from the drug label".
"""

from __future__ import annotations

import json
import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import numpy as np

from .catalog import normalize

MODEL_DIR = Path(os.getenv("MED_MODEL_DIR", Path(__file__).parent / "model"))


class ModelLayer:
    def __init__(self, directory: Path = MODEL_DIR):
        self.available = False
        self.meta: dict = {}
        self.label_tiers: Dict[str, dict] = {}
        label_path = directory / "label_tiers.json"
        if label_path.exists():
            self.label_tiers = {normalize(k): v for k, v in json.loads(label_path.read_text()).items()}
        meta_path, emb_path = directory / "meta.json", directory / "embeddings.npz"
        if not (meta_path.exists() and emb_path.exists()):
            return
        self.meta = json.loads(meta_path.read_text())
        data = np.load(emb_path)
        self.emb = data["embeddings"].astype(np.float64)
        self.rel = data["relation"].astype(np.float64) if "relation" in data else np.ones(self.emb.shape[1])
        self.bias = float(data["bias"]) if "bias" in data else 0.0
        self.risk = data["risk_probs"].astype(np.float64) if "risk_probs" in data else None
        self.threshold = float(self.meta.get("threshold", 0.5))
        self.index: Dict[str, int] = {}
        for i, drug in enumerate(self.meta.get("drugs", [])):
            for name in [drug.get("name", ""), *drug.get("synonyms", [])]:
                if name:
                    self.index.setdefault(normalize(name), i)
        self.available = True

    def find(self, names: Iterable[str]) -> Optional[int]:
        if not self.available:
            return None
        for n in names:
            i = self.index.get(normalize(n))
            if i is not None:
                return i
        return None

    def drug_name(self, i: int) -> str:
        return self.meta["drugs"][i]["name"]

    def pair_score(self, i: int, j: int) -> float:
        logit = float(np.sum(self.emb[i] * self.rel * self.emb[j]) + self.bias)
        return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, logit))))

    def risk_probs(self, i: int) -> Optional[Dict[str, float]]:
        if self.risk is None:
            return None
        classes = self.meta.get("risk_classes", ["generally_used", "caution", "avoid"])
        return {c: round(float(p), 3) for c, p in zip(classes, self.risk[i])}

    def label_tier(self, names: Iterable[str]) -> Optional[dict]:
        for n in names:
            hit = self.label_tiers.get(normalize(n))
            if hit:
                return hit
        return None

    def status(self) -> dict:
        if not self.available:
            return {"available": False, "label_tiers": len(self.label_tiers)}
        return {
            "available": True,
            "version": self.meta.get("version"),
            "trained_at": self.meta.get("trained_at"),
            "model": self.meta.get("model"),
            "drugs": len(self.meta.get("drugs", [])),
            "threshold": self.threshold,
            "metrics": self.meta.get("metrics", {}),
            "datasets": self.meta.get("datasets", []),
            "label_tiers": len(self.label_tiers),
        }


@lru_cache(maxsize=1)
def get_model() -> ModelLayer:
    return ModelLayer()


def candidate_names(text: str, matched_alias: Optional[str], synonyms: List[str]) -> List[str]:
    """Names to look up in the model / label tables: what was typed, what matched, then known synonyms."""
    out = [text, matched_alias or ""]
    out += synonyms
    return [n for n in dict.fromkeys(out) if n]
