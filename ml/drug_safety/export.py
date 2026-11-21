"""Trains the final graph model on the whole dataset and writes the files the app's backend serves
(no PyTorch needed there): FastAPI_Backend/med_safety/model/{meta.json, embeddings.npz, label_tiers.json}.

    python export.py --data data/synthetic --model rgcn        # then restart the backend
    python export.py --data data/real --model rgcn --benchmark results/real.json

The decision threshold is set on validation pairs so that ~90% of flagged pairs are real interactions
(fewer false alarms for patients). Test metrics from the benchmark are copied into meta.json for the app.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch

from benchmark import load_inputs
from core import _edge_tensors, make_split, train_ddi, train_risk
from data import REPO, TIERS

DEFAULT_OUT = REPO / "FastAPI_Backend" / "med_safety" / "model"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data")
    ap.add_argument("--pairs")
    ap.add_argument("--drugs")
    ap.add_argument("--labels")
    ap.add_argument("--model", default="rgcn", choices=["rgcn", "sage"])
    ap.add_argument("--k-relations", type=int, default=16)
    ap.add_argument("--max-rows", type=int, default=None)
    ap.add_argument("--epochs", type=int, default=300)
    ap.add_argument("--no-curated-labels", action="store_true")
    ap.add_argument("--benchmark", help="results/<name>.json to copy test metrics from")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    inputs = load_inputs(args)
    g = inputs["graph"]

    # 1) Interaction model: train with a validation split (for the threshold), then embed every drug using
    #    all known interactions for message passing.
    split = make_split(g, "random", args.seed)
    res = train_ddi(g, split, args.model, args.seed, epochs=args.epochs)
    enc, dec = res.model, res.decoder
    edges, etype = _edge_tensors(g.typed)
    enc.eval()
    with torch.no_grad():
        z = enc(g.fp, edges, etype).numpy()

    # 2) Pregnancy-risk head (trained on every labelled drug).
    risk_probs, risk_metrics = None, None
    if (g.risk_y >= 0).sum() >= 15:
        risk_metrics, risk_probs = train_risk(g, args.model, args.seed, train_all=False)
        _, risk_probs = train_risk(g, args.model, args.seed, train_all=True)

    metrics = {"ddi_random_split": res.test, "risk": risk_metrics}
    if args.benchmark and Path(args.benchmark).exists():
        bench = json.loads(Path(args.benchmark).read_text())
        metrics["benchmark"] = bench.get("summary")

    args.out.mkdir(parents=True, exist_ok=True)
    arrays = {
        "embeddings": z.astype(np.float32),
        "relation": dec.rel.detach().numpy().astype(np.float32),
        "bias": np.array(float(dec.bias.detach().numpy()[0]), dtype=np.float32),
    }
    if risk_probs is not None:
        arrays["risk_probs"] = risk_probs.astype(np.float32)
    np.savez_compressed(args.out / "embeddings.npz", **arrays)
    meta = {
        "version": datetime.now(timezone.utc).strftime("%Y%m%d"),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model": args.model,
        "decoder": "distmult",
        "threshold": res.threshold,
        "risk_classes": TIERS,
        "datasets": inputs["paths"],
        "metrics": metrics,
        "drugs": [{"id": g.ids[i], "name": g.names[i], "synonyms": g.synonyms[i]} for i in range(g.n)],
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=1))
    (args.out / "label_tiers.json").write_text(json.dumps(inputs["openfda"], indent=1))
    print(
        f"exported {args.model}: {g.n} drugs, threshold {res.threshold:.3f}, "
        f"test AUROC {res.test['auroc']:.3f} / AUPRC {res.test['auprc']:.3f}, {len(inputs['openfda'])} label tiers -> {args.out}"
    )


if __name__ == "__main__":
    main()
