"""Graph, features, splits, models and training for the two research tasks:

  ddi   drug-drug interaction link prediction (does this pair interact?), AUROC / AUPRC on held-out pairs
  risk  pregnancy risk tier per drug (generally_used / caution / avoid), node classification, macro AUROC / F1

Models: R-GCN (relation-typed message passing over side-effect edges), GraphSAGE (untyped), and the
Morgan-fingerprint + MLP baseline. Splits: "random" (held-out pairs) and "cold" (held-out DRUGS: every test pair
involves a drug the model never saw in training; the honest test for new medicines).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import average_precision_score, f1_score, precision_recall_curve, roc_auc_score

from data import TIERS, norm

FP_BITS = 1024


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


# ------------------------------------------------------------------------------------------- features

def morgan_fingerprints(smiles: List[str], bits: int = FP_BITS) -> Tuple[np.ndarray, np.ndarray]:
    """(fingerprints [N, bits], has_structure [N]). Falls back to hashed SMILES n-grams if RDKit is missing."""
    fps = np.zeros((len(smiles), bits), dtype=np.float32)
    ok = np.zeros(len(smiles), dtype=bool)
    try:
        from rdkit import Chem, RDLogger
        from rdkit.Chem import AllChem

        RDLogger.DisableLog("rdApp.*")
        for i, s in enumerate(smiles):
            mol = Chem.MolFromSmiles(s) if s and s != "nan" else None
            if mol is not None:
                fp = AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=bits)
                fps[i, list(fp.GetOnBits())] = 1.0
                ok[i] = True
    except ImportError:  # pragma: no cover
        print("RDKit not installed: using hashed SMILES n-grams instead of Morgan fingerprints")
        for i, s in enumerate(smiles):
            if s and s != "nan":
                for k in range(len(s) - 2):
                    fps[i, hash(s[k:k + 3]) % bits] = 1.0
                ok[i] = True
    return fps, ok


# ------------------------------------------------------------------------------------------- graph

@dataclass
class DrugGraph:
    ids: List[str]
    names: List[str]
    synonyms: List[List[str]]
    fp: torch.Tensor                 # [N, FP_BITS]
    has_fp: np.ndarray               # [N]
    pairs: np.ndarray                # [P, 2] unique interacting pairs (i < j)
    typed: np.ndarray                # [E, 3] (i, j, relation index) for message passing
    relations: List[str]
    risk_y: np.ndarray = field(default_factory=lambda: np.zeros(0))  # [N] tier index or -1
    risk_source: Dict[int, str] = field(default_factory=dict)

    @property
    def n(self) -> int:
        return len(self.ids)


def build_graph(pairs: pd.DataFrame, smiles_by_id: Dict[str, str], drugs: pd.DataFrame, k_relations: int = 16) -> DrugGraph:
    ids = sorted(set(pairs["a"]) | set(pairs["b"]))
    pos = {d: i for i, d in enumerate(ids)}
    info = drugs.set_index("id") if len(drugs) else None
    names, syns, smiles = [], [], []
    for d in ids:
        row = info.loc[d] if info is not None and d in info.index else None
        names.append(str(row["name"]) if row is not None else d)
        syns.append(list(row["synonyms"]) if row is not None else [])
        smiles.append(smiles_by_id.get(d) or (str(row["smiles"]) if row is not None else ""))
    fp, ok = morgan_fingerprints(smiles)

    rel_names = pairs["relation"].value_counts().index[:k_relations].tolist()
    rel_idx = {r: i for i, r in enumerate(rel_names)}
    other = len(rel_names)
    a = pairs["a"].map(pos).to_numpy()
    b = pairs["b"].map(pos).to_numpy()
    r = pairs["relation"].map(lambda x: rel_idx.get(x, other)).to_numpy()
    typed = np.unique(np.stack([a, b, r], axis=1), axis=0)
    unique_pairs = np.unique(np.stack([a, b], axis=1), axis=0)
    return DrugGraph(ids, names, syns, torch.tensor(fp), ok, unique_pairs, typed, rel_names + ["other"])


def attach_risk_labels(g: DrugGraph, label_tables: List[Dict[str, dict]]) -> None:
    """Later tables win (pass openFDA first, hand-checked list last)."""
    y = np.full(g.n, -1)
    for table in label_tables:
        for i in range(g.n):
            for name in [g.names[i], g.ids[i], *g.synonyms[i]]:
                hit = table.get(norm(name))
                if hit:
                    y[i] = TIERS.index(hit["tier"])
                    g.risk_source[i] = hit["source"]
                    break
    g.risk_y = y


# ------------------------------------------------------------------------------------------- splits

@dataclass
class Split:
    train: np.ndarray
    val: np.ndarray
    test: np.ndarray
    val_neg: np.ndarray
    test_neg: np.ndarray
    train_nodes: np.ndarray          # drugs allowed in training negatives / learned embeddings
    message_edges: np.ndarray        # typed edges used for message passing (training pairs only)
    unseen: np.ndarray               # bool [N]: drugs not seen in training (cold split)


def _sample_negatives(n_needed: int, nodes_a: np.ndarray, nodes_b: np.ndarray, positive: set, rng: np.random.Generator) -> np.ndarray:
    """Random non-interacting pairs (one end from nodes_a, the other from nodes_b), drawn in bulk."""
    if n_needed <= 0:
        return np.zeros((0, 2), dtype=np.int64)
    pos_codes = _positive_codes(positive)
    out = np.zeros((0, 2), dtype=np.int64)
    for _ in range(20):
        k = (n_needed - len(out)) * 3 + 16
        i = rng.choice(nodes_a, size=k)
        j = rng.choice(nodes_b, size=k)
        lo, hi = np.minimum(i, j), np.maximum(i, j)
        cand = np.stack([lo, hi], axis=1)[lo != hi]
        codes = cand[:, 0] * 10_000_000 + cand[:, 1]
        cand = cand[~np.isin(codes, pos_codes)]
        out = np.unique(np.concatenate([out, cand]), axis=0)
        if len(out) >= n_needed:
            break
    return rng.permutation(out)[:n_needed]


_CODE_CACHE: Dict[int, np.ndarray] = {}


def _positive_codes(positive: set) -> np.ndarray:
    key = id(positive)
    if key not in _CODE_CACHE:
        arr = np.array(sorted(positive), dtype=np.int64).reshape(-1, 2)
        _CODE_CACHE.clear()
        _CODE_CACHE[key] = arr[:, 0] * 10_000_000 + arr[:, 1]
    return _CODE_CACHE[key]


def positive_set(g: DrugGraph) -> set:
    if not hasattr(g, "_positive"):
        g._positive = set(map(tuple, g.pairs.tolist()))
    return g._positive


def make_split(g: DrugGraph, kind: str, seed: int, val_frac: float = 0.1, test_frac: float = 0.1) -> Split:
    rng = np.random.default_rng(seed)
    positive = positive_set(g)
    all_nodes = np.arange(g.n)
    unseen = np.zeros(g.n, dtype=bool)
    if kind == "random":
        perm = rng.permutation(len(g.pairs))
        n_val, n_test = int(len(perm) * val_frac), int(len(perm) * test_frac)
        val, test, train = g.pairs[perm[:n_val]], g.pairs[perm[n_val:n_val + n_test]], g.pairs[perm[n_val + n_test:]]
        train_nodes = all_nodes
        val_neg = _sample_negatives(len(val), all_nodes, all_nodes, positive, rng)
        test_neg = _sample_negatives(len(test), all_nodes, all_nodes, positive, rng)
    elif kind == "cold":
        perm = rng.permutation(g.n)
        n_val, n_test = max(1, int(g.n * val_frac)), max(1, int(g.n * test_frac))
        val_nodes, test_nodes = perm[:n_val], perm[n_val:n_val + n_test]
        train_nodes = perm[n_val + n_test:]
        is_val, is_test = np.isin(g.pairs, val_nodes).any(1), np.isin(g.pairs, test_nodes).any(1)
        train = g.pairs[~is_val & ~is_test]
        val = g.pairs[is_val & ~is_test]
        test = g.pairs[is_test]
        unseen[val_nodes] = True
        unseen[test_nodes] = True
        val_neg = _sample_negatives(len(val), val_nodes, np.concatenate([train_nodes, val_nodes]), positive, rng)
        test_neg = _sample_negatives(len(test), test_nodes, all_nodes, positive, rng)
    else:
        raise ValueError(kind)
    train_codes = train[:, 0].astype(np.int64) * 10_000_000 + train[:, 1]
    keep = np.isin(g.typed[:, 0].astype(np.int64) * 10_000_000 + g.typed[:, 1], train_codes)
    return Split(train, val, test, val_neg, test_neg, train_nodes, g.typed[keep], unseen)


# ------------------------------------------------------------------------------------------- models

class Encoder(nn.Module):
    def __init__(self, kind: str, n_nodes: int, n_rel: int, hidden: int = 64, out: int = 64, learned: bool = True, dropout: float = 0.2):
        super().__init__()
        from torch_geometric.nn import RGCNConv, SAGEConv

        self.kind = kind
        self.inp = nn.Linear(FP_BITS, hidden)
        self.emb = nn.Embedding(n_nodes, hidden) if learned else None
        if self.emb is not None:
            nn.init.normal_(self.emb.weight, std=0.1)
        if kind == "rgcn":
            bases = min(n_rel, 8)
            self.c1, self.c2 = RGCNConv(hidden, hidden, n_rel, num_bases=bases), RGCNConv(hidden, out, n_rel, num_bases=bases)
        elif kind == "sage":
            self.c1, self.c2 = SAGEConv(hidden, hidden), SAGEConv(hidden, out)
        else:
            raise ValueError(kind)
        self.dropout = dropout

    def forward(self, fp: torch.Tensor, edges: torch.Tensor, etype: torch.Tensor, emb_mask: Optional[torch.Tensor] = None) -> torch.Tensor:
        h = self.inp(fp)
        if self.emb is not None:
            e = self.emb.weight
            h = h + (e * emb_mask.unsqueeze(1) if emb_mask is not None else e)
        h = F.dropout(F.relu(h), self.dropout, self.training)
        if self.kind == "rgcn":
            h = F.relu(self.c1(h, edges, etype))
            h = F.dropout(h, self.dropout, self.training)
            return self.c2(h, edges, etype)
        h = F.relu(self.c1(h, edges))
        h = F.dropout(h, self.dropout, self.training)
        return self.c2(h, edges)


class DistMult(nn.Module):
    """score(a, b) = sum(z_a * r * z_b) + bias. Symmetric, and cheap to serve with numpy."""

    def __init__(self, dim: int):
        super().__init__()
        self.rel = nn.Parameter(torch.ones(dim))
        self.bias = nn.Parameter(torch.zeros(1))

    def forward(self, z: torch.Tensor, pairs: torch.Tensor) -> torch.Tensor:
        return (z[pairs[:, 0]] * self.rel * z[pairs[:, 1]]).sum(-1) + self.bias


class FPPairMLP(nn.Module):
    """Baseline: Morgan fingerprints of both drugs -> MLP. Order-invariant input [fa + fb, fa * fb]."""

    def __init__(self, hidden: int = 256):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(2 * FP_BITS, hidden), nn.ReLU(), nn.Dropout(0.2), nn.Linear(hidden, 64), nn.ReLU(), nn.Linear(64, 1))

    def forward(self, fp: torch.Tensor, pairs: torch.Tensor) -> torch.Tensor:
        a, b = fp[pairs[:, 0]], fp[pairs[:, 1]]
        return self.net(torch.cat([a + b, a * b], dim=1)).squeeze(-1)


def _edge_tensors(typed: np.ndarray) -> Tuple[torch.Tensor, torch.Tensor]:
    if len(typed) == 0:
        return torch.zeros((2, 0), dtype=torch.long), torch.zeros(0, dtype=torch.long)
    i, j, r = (torch.tensor(typed[:, k], dtype=torch.long) for k in range(3))
    return torch.stack([torch.cat([i, j]), torch.cat([j, i])]), torch.cat([r, r])


# ------------------------------------------------------------------------------------------- DDI task

def ddi_scores(labels: np.ndarray, scores: np.ndarray) -> Dict[str, float]:
    return {"auroc": float(roc_auc_score(labels, scores)), "auprc": float(average_precision_score(labels, scores))}


def pick_threshold(labels: np.ndarray, probs: np.ndarray, min_precision: float = 0.9) -> float:
    """Lowest threshold reaching the target precision on validation (few false alarms); else best F1."""
    p, r, t = precision_recall_curve(labels, probs)
    ok = np.nonzero(p[:-1] >= min_precision)[0]
    if len(ok):
        return float(t[ok[0]])
    f1 = 2 * p[:-1] * r[:-1] / np.maximum(p[:-1] + r[:-1], 1e-9)
    return float(t[int(np.argmax(f1))])


@dataclass
class DDIResult:
    val: Dict[str, float]
    test: Dict[str, float]
    threshold: float
    model: object = None
    decoder: object = None


def train_ddi(g: DrugGraph, split: Split, model: str, seed: int, epochs: int = 300, patience: int = 30, lr: float = 5e-3) -> DDIResult:
    set_seed(seed)
    rng = np.random.default_rng(seed)
    fp = g.fp
    positive = positive_set(g)
    edges, etype = _edge_tensors(split.message_edges)
    learned = not split.unseen.any()  # learned per-drug vectors only when every drug is seen in training
    emb_mask = None
    if model == "fp_mlp":
        net, dec = FPPairMLP(), None
        params = list(net.parameters())
    else:
        net, dec = Encoder(model, g.n, len(g.relations), learned=learned), DistMult(64)
        params = list(net.parameters()) + list(dec.parameters())
    opt = torch.optim.Adam(params, lr=lr, weight_decay=1e-5)
    val_pairs = torch.tensor(np.concatenate([split.val, split.val_neg]), dtype=torch.long)
    val_y = np.concatenate([np.ones(len(split.val)), np.zeros(len(split.val_neg))])

    def score(pairs: torch.Tensor) -> torch.Tensor:
        if dec is None:
            return net(fp, pairs)
        return dec(net(fp, edges, etype, emb_mask), pairs)

    best, best_state, bad = -1.0, None, 0
    train_pos = torch.tensor(split.train, dtype=torch.long)
    for epoch in range(epochs):
        net.train()
        neg = torch.tensor(_sample_negatives(len(split.train), split.train_nodes, split.train_nodes, positive, rng), dtype=torch.long)
        pairs = torch.cat([train_pos, neg])
        y = torch.cat([torch.ones(len(train_pos)), torch.zeros(len(neg))])
        opt.zero_grad()
        loss = F.binary_cross_entropy_with_logits(score(pairs), y)
        loss.backward()
        opt.step()
        if epoch % 5 == 0 or epoch == epochs - 1:
            net.eval()
            with torch.no_grad():
                v = torch.sigmoid(score(val_pairs)).numpy()
            ap = average_precision_score(val_y, v)
            if ap > best + 1e-4:
                best, bad = ap, 0
                best_state = ({k: t.clone() for k, t in net.state_dict().items()}, {k: t.clone() for k, t in dec.state_dict().items()} if dec else None)
            else:
                bad += 5
                if bad >= patience:
                    break
    net.load_state_dict(best_state[0])
    if dec is not None:
        dec.load_state_dict(best_state[1])
    net.eval()
    with torch.no_grad():
        v = torch.sigmoid(score(val_pairs)).numpy()
        test_pairs = torch.tensor(np.concatenate([split.test, split.test_neg]), dtype=torch.long)
        t = torch.sigmoid(score(test_pairs)).numpy()
    test_y = np.concatenate([np.ones(len(split.test)), np.zeros(len(split.test_neg))])
    thr = pick_threshold(val_y, v)
    pred = t >= thr
    tp = float((pred & (test_y == 1)).sum())
    test_metrics = {
        **ddi_scores(test_y, t),
        "precision_at_threshold": tp / max(1.0, float(pred.sum())),
        "recall_at_threshold": tp / max(1.0, float((test_y == 1).sum())),
        "n_test_pairs": int(len(test_y)),
    }
    return DDIResult(ddi_scores(val_y, v), test_metrics, thr, net, dec)


# ------------------------------------------------------------------------------------------- risk task

def train_risk(g: DrugGraph, model: str, seed: int, epochs: int = 400, patience: int = 40, lr: float = 5e-3, train_all: bool = False):
    """Node classification of pregnancy tier. Returns (metrics, probabilities for every drug [N, 3])."""
    set_seed(seed)
    labeled = np.nonzero(g.risk_y >= 0)[0]
    if len(labeled) < 15:
        raise ValueError(f"Only {len(labeled)} drugs have pregnancy labels; need at least 15.")
    rng = np.random.default_rng(seed)
    perm = rng.permutation(labeled)
    n_val = n_test = max(3, int(0.15 * len(perm)))
    test_idx, val_idx, train_idx = perm[:n_test], perm[n_test:n_test + n_val], perm[n_test + n_val:]
    if train_all:
        train_idx = labeled
    y = torch.tensor(np.maximum(g.risk_y, 0), dtype=torch.long)
    counts = np.bincount(g.risk_y[train_idx], minlength=3).astype(float)
    weight = torch.tensor(counts.sum() / np.maximum(counts, 1) / 3, dtype=torch.float32)
    edges, etype = _edge_tensors(g.typed)
    if model == "fp_mlp":
        net = nn.Sequential(nn.Linear(FP_BITS, 256), nn.ReLU(), nn.Dropout(0.2), nn.Linear(256, 3))
        forward = lambda: net(g.fp)  # noqa: E731
    else:
        enc = Encoder(model, g.n, len(g.relations), learned=False)
        head = nn.Linear(64, 3)
        net = nn.ModuleList([enc, head])
        forward = lambda: head(F.relu(enc(g.fp, edges, etype)))  # noqa: E731
    opt = torch.optim.Adam(net.parameters(), lr=lr, weight_decay=1e-4)
    best, best_state, bad = -1.0, None, 0
    for epoch in range(epochs):
        net.train()
        opt.zero_grad()
        loss = F.cross_entropy(forward()[train_idx], y[train_idx], weight=weight)
        loss.backward()
        opt.step()
        net.eval()
        with torch.no_grad():
            logits = forward()
        f1 = f1_score(g.risk_y[val_idx], logits[val_idx].argmax(1).numpy(), average="macro")
        if f1 > best + 1e-4 or best_state is None:
            best, bad, best_state = f1, 0, {k: t.clone() for k, t in net.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                break
    net.load_state_dict(best_state)
    net.eval()
    with torch.no_grad():
        probs = torch.softmax(forward(), dim=1).numpy()
    yt, pt = g.risk_y[test_idx], probs[test_idx]
    metrics = {"macro_f1": float(f1_score(yt, pt.argmax(1), average="macro")), "accuracy": float((pt.argmax(1) == yt).mean()), "n_test_drugs": int(len(yt))}
    try:
        metrics["macro_auroc"] = float(roc_auc_score(yt, pt, multi_class="ovr", average="macro", labels=[0, 1, 2]))
    except ValueError:
        metrics["macro_auroc"] = float("nan")  # a class missing from this small test set
    return metrics, probs
