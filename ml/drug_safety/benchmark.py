"""Benchmark: R-GCN vs GraphSAGE vs Morgan-fingerprint MLP, on random and cold-drug splits, over several seeds.

    python benchmark.py --data data/synthetic                 # or data/real with your files
    python benchmark.py --pairs data/real/TWOSIDES.csv --drugs data/real/drugs.csv --labels "data/real/drug-label-*.json"

Writes results/<name>.json, .csv and .md (a table ready for the report).
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

from core import attach_risk_labels, build_graph, make_split, train_ddi, train_risk
from data import find_files, load_curated_labels, load_drugs, load_openfda_labels, load_pairs

HERE = Path(__file__).parent
PAIR_PATTERNS = ["*pairs*.csv", "*ChCh*", "*biosnap*", "*BIOSNAP*", "*TWOSIDES*.csv", "*twosides*.csv", "*combo*.csv", "*ddi*.csv", "*ddi*.tsv", "*DDI*.csv"]
DRUG_PATTERNS = ["drugs.csv", "*vocabulary*.csv"]
LABEL_PATTERNS = ["*openfda*.json", "drug-label-*.json"]


def load_inputs(args) -> dict:
    data = Path(args.data) if args.data else None
    pairs_path = Path(args.pairs) if args.pairs else (find_files(data, PAIR_PATTERNS) or [None])[0]
    if pairs_path is None:
        raise SystemExit(f"No interaction file found in {data}. Expected one of: {', '.join(PAIR_PATTERNS)}")
    drugs_path = Path(args.drugs) if args.drugs else (find_files(data, DRUG_PATTERNS) or [None])[0] if data else None
    label_paths = find_files(Path("."), [args.labels]) if args.labels else (find_files(data, LABEL_PATTERNS) if data else [])
    print(f"pairs:  {pairs_path}\ndrugs:  {drugs_path}\nlabels: {[str(p) for p in label_paths]}")
    t = time.time()
    pairs, smiles = load_pairs(pairs_path, args.max_rows)
    drugs = load_drugs(drugs_path)
    graph = build_graph(pairs, smiles, drugs, args.k_relations)
    openfda = load_openfda_labels(label_paths) if label_paths else {}
    attach_risk_labels(graph, [openfda, load_curated_labels()] if not args.no_curated_labels else [openfda])
    print(
        f"graph: {graph.n} drugs, {len(graph.pairs)} interacting pairs, {len(graph.typed)} typed edges, "
        f"{len(graph.relations)} relation types, {int(graph.has_fp.sum())} with structures, "
        f"{int((graph.risk_y >= 0).sum())} with pregnancy labels ({time.time() - t:.1f}s)"
    )
    return {"graph": graph, "openfda": openfda, "paths": {"pairs": str(pairs_path), "drugs": str(drugs_path) if drugs_path else None, "labels": [str(p) for p in label_paths]}}


def summarise(rows: List[dict], keys: List[str], metrics: List[str]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    agg = df.groupby(keys)[metrics].agg(["mean", "std"]).reset_index()
    agg.columns = [" ".join(c).strip() for c in agg.columns]
    return agg


def to_markdown(df: pd.DataFrame, keys: List[str], metrics: List[str]) -> str:
    head = "| " + " | ".join(k.title() for k in keys) + " | " + " | ".join(m.upper().replace("_", " ") for m in metrics) + " |"
    sep = "|" + "---|" * (len(keys) + len(metrics))
    lines = [head, sep]
    for _, r in df.iterrows():
        cells = [str(r[k]) for k in keys] + [f"{r[m + ' mean']:.3f} ± {0 if np.isnan(r[m + ' std']) else r[m + ' std']:.3f}" for m in metrics]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", help="folder with the dataset files")
    ap.add_argument("--pairs")
    ap.add_argument("--drugs")
    ap.add_argument("--labels", help="glob for openFDA label JSON files")
    ap.add_argument("--name", default=None, help="results file name (default: data folder name)")
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--models", default="rgcn,sage,fp_mlp")
    ap.add_argument("--splits", default="random,cold")
    ap.add_argument("--k-relations", type=int, default=16, help="most frequent side-effect types kept as R-GCN relations")
    ap.add_argument("--max-rows", type=int, default=None, help="read only the first N rows (for very large files)")
    ap.add_argument("--epochs", type=int, default=300)
    ap.add_argument("--no-curated-labels", action="store_true", help="use only openFDA labels for the risk task")
    ap.add_argument("--skip-risk", action="store_true")
    args = ap.parse_args()

    inputs = load_inputs(args)
    g = inputs["graph"]
    models = args.models.split(",")
    ddi_rows, risk_rows = [], []
    for split_kind in args.splits.split(","):
        for seed in range(args.seeds):
            split = make_split(g, split_kind, seed)
            for model in models:
                t = time.time()
                res = train_ddi(g, split, model, seed, epochs=args.epochs)
                ddi_rows.append({"task": "ddi", "split": split_kind, "model": model, "seed": seed, **res.test, "seconds": round(time.time() - t, 1)})
                print(f"ddi  {split_kind:6s} {model:7s} seed {seed}: AUROC {res.test['auroc']:.3f}  AUPRC {res.test['auprc']:.3f}")
    if not args.skip_risk and (g.risk_y >= 0).sum() >= 15:
        for seed in range(args.seeds):
            for model in models:
                metrics, _ = train_risk(g, model, seed)
                risk_rows.append({"task": "risk", "model": model, "seed": seed, **metrics})
                print(f"risk {model:7s} seed {seed}: macro-AUROC {metrics['macro_auroc']:.3f}  macro-F1 {metrics['macro_f1']:.3f}")

    name = args.name or (Path(args.data).name if args.data else "run")
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    ddi_sum = summarise(ddi_rows, ["split", "model"], ["auroc", "auprc"])
    md = [f"# Benchmark: {name}", "", f"{g.n} drugs, {len(g.pairs)} interacting pairs, {len(g.relations)} relation types, {args.seeds} seeds.", "",
          "## Drug-drug interaction (link prediction, held-out pairs)", "", "*random* = held-out pairs; *cold* = every test pair involves a drug never seen in training.", "",
          to_markdown(ddi_sum, ["split", "model"], ["auroc", "auprc"])]
    if risk_rows:
        risk_sum = summarise(risk_rows, ["model"], ["macro_auroc", "macro_f1", "accuracy"])
        md += ["", "## Pregnancy risk tier (node classification)", "", f"{int((g.risk_y >= 0).sum())} labelled drugs.", "", to_markdown(risk_sum, ["model"], ["macro_auroc", "macro_f1", "accuracy"])]
    (out / f"{name}.md").write_text("\n".join(md) + "\n")
    pd.DataFrame(ddi_rows + risk_rows).to_csv(out / f"{name}.csv", index=False)
    (out / f"{name}.json").write_text(json.dumps({
        "name": name, "created_at": datetime.now(timezone.utc).isoformat(), "inputs": inputs["paths"],
        "graph": {"drugs": g.n, "pairs": int(len(g.pairs)), "relations": len(g.relations), "labelled": int((g.risk_y >= 0).sum())},
        "ddi": ddi_rows, "risk": risk_rows,
        "summary": {"ddi": ddi_sum.to_dict("records"), "risk": summarise(risk_rows, ["model"], ["macro_auroc", "macro_f1"]).to_dict("records") if risk_rows else []},
    }, indent=1))
    print(f"\n" + "\n".join(md) + f"\n\nSaved results/{name}.md, .csv, .json")


if __name__ == "__main__":
    main()
