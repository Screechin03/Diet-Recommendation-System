"""Writes a small synthetic dataset in the REAL file formats (TDC-style pairs, drugs.csv, openFDA label JSON),
so the whole pipeline (benchmark -> export -> app) can be run before the real datasets arrive.

Interactions are generated from hidden drug properties that are partly visible in the molecules, so the
models have something real to learn; the numbers mean nothing medically.

    python synthetic.py --out data/synthetic
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

FRAGMENTS = ["C", "CC", "O", "N", "c1ccccc1", "C(=O)O", "Cl", "F", "C(=O)N", "CCN", "OC", "S"]
REAL = {
    "paracetamol": "CC(=O)NC1=CC=C(O)C=C1",
    "ibuprofen": "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O",
    "aspirin": "CC(=O)OC1=CC=CC=C1C(=O)O",
    "caffeine": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
    "metformin": "CN(C)C(=N)N=C(N)N",
    "levothyroxine": "NC(CC1=CC(I)=C(OC2=CC(I)=C(O)C(I)=C2)C(I)=C1)C(O)=O",
    "warfarin": "CC(=O)CC(C1=CC=CC=C1)C1=C(O)C2=CC=CC=C2OC1=O",
    "valproic acid": "CCCC(CCC)C(=O)O",
}


def _valid(smi: str, i: int) -> str:
    """Keep the molecule if RDKit can parse it; otherwise a simple valid chain (still drug-specific)."""
    try:
        from rdkit import Chem, RDLogger

        RDLogger.DisableLog("rdApp.*")
        if Chem.MolFromSmiles(smi) is not None:
            return smi
    except ImportError:
        return smi
    return "C" * (2 + i % 9) + "O" + "N" * (i % 3) + "C(=O)O"


def generate(out: Path, n_drugs: int = 160, n_relations: int = 5, seed: int = 0) -> None:
    rng = np.random.default_rng(seed)
    out.mkdir(parents=True, exist_ok=True)
    names = list(REAL) + [f"synthodrug {i:03d}" for i in range(n_drugs - len(REAL))]
    frag_use = rng.random((n_drugs, len(FRAGMENTS))) < 0.3
    smiles = []
    for i, name in enumerate(names):
        if name in REAL:
            smiles.append(REAL[name])
            continue
        parts = [f for f, use in zip(FRAGMENTS, frag_use[i]) if use] or ["CC"]
        smiles.append(_valid("C" + "".join(parts), i))
    # Hidden properties: half come from the fragments (learnable from structure), half are free.
    latent = np.concatenate([frag_use.astype(float) @ rng.normal(size=(len(FRAGMENTS), 4)), rng.normal(size=(n_drugs, 4))], axis=1)
    latent /= latent.std(axis=0, keepdims=True)
    W = rng.normal(size=(n_relations, latent.shape[1]))
    ids = [f"DB9{i:04d}" for i in range(n_drugs)]
    rows = []
    for i in range(n_drugs):
        for j in range(i + 1, n_drugs):
            logits = (latent[i] * W * latent[j]).sum(axis=1) - 3.0
            for r in np.nonzero(rng.random(n_relations) < 1 / (1 + np.exp(-logits)))[0]:
                rows.append((ids[i], smiles[i], ids[j], smiles[j], f"side effect {r}"))
    pd.DataFrame(rows, columns=["Drug1_ID", "Drug1", "Drug2_ID", "Drug2", "Y"]).to_csv(out / "pairs.csv", index=False)
    pd.DataFrame({"id": ids, "name": names, "synonyms": ["" for _ in ids], "smiles": smiles}).to_csv(out / "drugs.csv", index=False)

    # Pregnancy category depends on two hidden properties, so graph neighbours carry signal.
    score = latent[:, 0] + latent[:, 5]
    cats = np.where(score > 1.0, "X", np.where(score > 0.2, "D", np.where(score > -0.6, "C", "B")))
    results = []
    for name, cat in zip(names, cats):
        if rng.random() < 0.75:  # not every drug has a label
            results.append({"openfda": {"generic_name": [name.upper()]}, "pregnancy": [f"8.1 Pregnancy. Pregnancy Category {cat}. Synthetic text."]})
    (out / "openfda_labels.json").write_text(json.dumps({"results": results}))
    print(f"wrote {len(rows)} interactions among {n_drugs} drugs, {len(results)} labels -> {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "data" / "synthetic")
    ap.add_argument("--drugs", type=int, default=160)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    generate(a.out, a.drugs, seed=a.seed)
