"""Step 2: estimate iron, folate and calcium for every recipe, and test how trustworthy that is.

    python estimate.py               # trains, evaluates, writes results/estimator.{md,json} and the app's model file

The recipes give exact per-serving calories, protein, fat, carbohydrate, fibre, sugar, sodium, saturated fat and
cholesterol, but no micronutrients and no ingredient quantities. If we knew how much of each ingredient a serving
contains, USDA per-gram values would give every nutrient. We model the unknown amounts:

    share_i  = softmax(w_ingredient) over the recipe's matched ingredients       (mass fractions)
    N_k      = calories * sum_i share_i * n_ik / sum_i share_i * e_i              (e = kcal per gram)

so the serving mass is pinned by the known calories, and one weight per ingredient ("salt is used in small
amounts, flour in large ones") is learned by fitting the nutrients we *do* know. The same weights then give
iron, folate and calcium.

Evaluation (held-out 20% of recipes):
  * equal-mass   every matched ingredient has the same mass           (no learning)
  * equal-energy every ingredient contributes the same calories       (no learning; zero-calorie ones drop out)
  * learned      weights fitted on all 8 known nutrients
  * transfer     weights fitted on 6 nutrients, scored on fibre and sodium it never saw. This is the honest test
                 for nutrients without labels (iron, folate, calcium): does fitting some nutrients make others right?
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from scipy.stats import spearmanr

from ingredients import DATA, parse_parts, read_recipes

HERE = Path(__file__).parent
RESULTS = HERE / "results"
EXPORT = HERE.parent.parent / "FastAPI_Backend" / "meal_plan" / "model"

# recipe column -> USDA column (per 100 g)
KNOWN = {
    "ProteinContent": "protein_g", "FatContent": "fat_g", "CarbohydrateContent": "carbs_g", "FiberContent": "fiber_g",
    "SugarContent": "sugar_g", "SodiumContent": "sodium_mg", "SaturatedFatContent": "satfat_g", "CholesterolContent": "cholesterol_mg",
}
MICRO = ["iron_mg", "folate_ug", "calcium_mg"]
HELD_OUT = ["FiberContent", "SodiumContent"]
MAX_ING = 24
SEED = 0


def load() -> dict:
    usda = pd.read_csv(DATA / "usda_foods.csv").set_index("fdc_id")
    matches = pd.read_csv(DATA / "ingredient_matches.csv").dropna(subset=["fdc_id"])
    matches["fdc_id"] = matches["fdc_id"].astype(int)
    vocab = {name: i for i, name in enumerate(matches["ingredient"])}
    cols = ["energy_kcal"] + list(KNOWN.values()) + MICRO
    per_g = usda.loc[matches["fdc_id"], cols].to_numpy(dtype=np.float32) / 100.0  # per gram

    rec = read_recipes(usecols=["RecipeId", "Name", "RecipeIngredientParts", "Calories"] + list(KNOWN))
    idx = np.full((len(rec), MAX_ING), -1, dtype=np.int64)
    n_parts = np.zeros(len(rec), dtype=np.int32)
    for r, value in enumerate(rec["RecipeIngredientParts"]):
        parts = parse_parts(value)
        n_parts[r] = len(parts)
        ids = [vocab[p] for p in dict.fromkeys(parts) if p in vocab][:MAX_ING]
        idx[r, : len(ids)] = ids
    n_match = (idx >= 0).sum(1)
    return {"rec": rec, "idx": idx, "n_parts": n_parts, "n_match": n_match, "per_g": per_g, "cols": cols, "vocab": vocab}


class ShareModel(torch.nn.Module):
    """Mass shares = softmax(prior + w). Without a prior every ingredient starts with the same mass; with the
    equal-energy prior (-log kcal/g) every ingredient starts with the same calories and `w` learns corrections."""

    def __init__(self, n_ing: int, prior: torch.Tensor | None = None):
        super().__init__()
        self.w = torch.nn.Parameter(torch.zeros(n_ing))
        self.register_buffer("prior", prior if prior is not None else torch.zeros(n_ing))

    def shares(self, idx: torch.Tensor) -> torch.Tensor:
        logits = torch.where(idx >= 0, (self.prior + self.w)[idx.clamp(min=0)], torch.full_like(idx, -1e9, dtype=torch.float32))
        return torch.softmax(logits, dim=1)

    def forward(self, idx: torch.Tensor, per_g: torch.Tensor, calories: torch.Tensor) -> torch.Tensor:
        s = self.shares(idx)                                   # [R, L]
        mix = torch.einsum("rl,rlk->rk", s, per_g[idx.clamp(min=0)])  # per gram of the recipe
        energy = mix[:, :1].clamp(min=0.05)                    # kcal per gram
        return calories[:, None] * mix / energy                # per serving


def energy_prior(per_g: torch.Tensor) -> torch.Tensor:
    """Equal calories per ingredient: mass share proportional to 1 / (kcal per gram). Zero-calorie ingredients
    (salt, water, spices) get the mass of a 4 kcal/g ingredient as a neutral start."""
    e = per_g[:, 0]
    return -torch.log(torch.where(e >= 0.05, e, torch.full_like(e, 4.0)))


def fit(idx, per_g, cal, y, cols, epochs=150, lr=0.08, l2=1e-4, prior=None) -> ShareModel:
    torch.manual_seed(SEED)
    model = ShareModel(per_g.shape[0], prior)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    scale = torch.tensor([max(float(np.median(y[:, j])), 1e-3) for j in range(y.shape[1])])
    yt = torch.log1p(torch.from_numpy(y) / scale)
    for epoch in range(epochs):
        opt.zero_grad()
        pred = model(idx, per_g, cal)[:, cols]
        loss = torch.nn.functional.smooth_l1_loss(torch.log1p(pred.clamp(min=0) / scale), yt) + l2 * (model.w ** 2).sum()
        loss.backward()
        opt.step()
        if epoch % 100 == 0 or epoch == epochs - 1:
            print(f"    epoch {epoch:3d}  loss {loss.item():.4f}", flush=True)
    return model


def equal_energy(idx: np.ndarray, per_g: np.ndarray, cal: np.ndarray) -> np.ndarray:
    """Each ingredient with calories contributes the same share of the recipe's calories."""
    dens = per_g[np.clip(idx, 0, None)]                 # [R, L, K]
    e = dens[:, :, 0]
    ok = (idx >= 0) & (e > 0.05)
    per_kcal = np.where(ok[:, :, None], dens / np.where(ok, e, 1)[:, :, None], 0)
    return cal[:, None] * per_kcal.sum(1) / np.maximum(ok.sum(1), 1)[:, None]


REFERENCE_CATEGORIES = {"Baked Products", "Soups, Sauces, and Gravies", "Meals, Entrees, and Side Dishes", "Fast Foods", "Restaurant Foods", "Sweets"}
REFERENCE_SKIP = ("mix", "babyfood", "frozen", "canned", "condensed", "dry", "low", "reduced", "free", "fortified", "dietetic")


def reference_dishes(names: pd.Series) -> pd.DataFrame:
    """Independent check for iron/folate/calcium: recipes whose name matches a USDA prepared dish ("sugar
    cookies" <-> "Cookies, sugar, ..."). Returns recipe row, USDA nutrient densities per kcal."""
    from ingredients import normalise

    usda = pd.read_csv(DATA / "usda_foods.csv")
    usda = usda[usda["category"].isin(REFERENCE_CATEGORIES) & (usda["energy_kcal"] > 50)]
    usda = usda[~usda["description"].str.lower().str.contains("|".join(REFERENCE_SKIP))]
    keys = []
    for d in usda["description"]:
        parts = [p for p in d.split(",")[:2]]
        tokens = frozenset(w for w in normalise(" ".join(parts)).split() if len(w) > 2 and w not in {"with", "and", "from", "recipe", "prepared", "commercially", "restaurant", "fast", "food", "type", "style"})
        keys.append(tokens)
    usda = usda.assign(key=keys)
    usda = usda[usda["key"].map(len) >= 2]
    per_kcal = {m: (usda[m] / usda["energy_kcal"]).to_numpy() for m in MICRO}
    by_token: dict = {}
    for j, key in enumerate(usda["key"]):
        for tok in key:
            by_token.setdefault(tok, []).append(j)
    rows = []
    for r, name in enumerate(names.fillna("")):
        tokens = set(normalise(name).split())
        if not tokens or len(tokens) > 5:
            continue
        cand = {j for tok in tokens for j in by_token.get(tok, [])}
        hits = [j for j in cand if usda["key"].iat[j] <= tokens and len(tokens) <= len(usda["key"].iat[j]) + 2]
        if not hits:
            continue
        best = max(len(usda["key"].iat[j]) for j in hits)
        hits = [j for j in hits if len(usda["key"].iat[j]) == best]
        rows.append({"row": r, "dish": usda["description"].iat[hits[0]], **{m: float(np.median(per_kcal[m][hits])) for m in MICRO}})
    return pd.DataFrame(rows)


def external_scores(pred_per_kcal: np.ndarray, ref: pd.DataFrame) -> dict:
    """Per micronutrient: median |log2(estimate / USDA)| and share within a factor of 2."""
    out = {}
    for j, m in enumerate(MICRO):
        est, true = pred_per_kcal[:, j], ref[m].to_numpy()
        ok = (true > 0) & np.isfinite(est)
        ratio = np.log2(np.maximum(est[ok], 1e-9) / true[ok])
        out[m] = {"median_abs_log2": float(np.median(np.abs(ratio))), "within_2x": float((np.abs(ratio) <= 1).mean()),
                  "spearman": float(spearmanr(est[ok], true[ok]).statistic), "n": int(ok.sum())}
    out["within_2x_mean"] = float(np.mean([out[m]["within_2x"] for m in MICRO]))
    return out


def metrics(pred: np.ndarray, true: np.ndarray) -> dict:
    rel = np.abs(pred - true) / np.maximum(true, 1e-6)
    near = (np.abs(pred - true) <= np.maximum(0.3 * true, 0.1 * np.median(true) + 1e-6)).mean()
    lp, lt = np.log1p(pred), np.log1p(true)
    r2 = 1 - ((lp - lt) ** 2).sum() / ((lt - lt.mean()) ** 2).sum()
    return {"spearman": float(spearmanr(pred, true).statistic), "r2_log": float(r2), "median_rel_err": float(np.median(rel)), "within_30pct": float(near)}


def main() -> None:
    t0 = time.time()
    d = load()
    rec, idx_all, per_g_np = d["rec"], d["idx"], d["per_g"]
    known_cols = list(KNOWN)
    k_index = {c: 1 + i for i, c in enumerate(known_cols)}          # position in per_g columns
    y_all = rec[known_cols].to_numpy(dtype=np.float32)
    cal_all = rec["Calories"].to_numpy(dtype=np.float32)
    frac = d["n_match"] / np.maximum(d["n_parts"], 1)
    has_energy = (per_g_np[np.clip(idx_all, 0, None), 0] * (idx_all >= 0)).max(1) > 0.05
    usable = (cal_all >= 30) & (cal_all <= 2000) & (d["n_match"] >= 2) & (frac >= 0.7) & has_energy & np.isfinite(y_all).all(1)
    print(f"recipes: {len(rec)}, usable for fitting: {int(usable.sum())} ({usable.mean():.0%}); "
          f"ingredients in model: {per_g_np.shape[0]}  ({time.time() - t0:.0f}s)")

    rng = np.random.default_rng(SEED)
    rows = np.flatnonzero(usable)
    rng.shuffle(rows)
    cut = int(0.8 * len(rows))
    tr, te = rows[:cut], rows[cut:]
    per_g = torch.from_numpy(per_g_np)
    T = lambda a: torch.from_numpy(a)

    results: dict = {"recipes": int(len(rec)), "usable": int(usable.sum()), "train": int(len(tr)), "test": int(len(te)),
                     "ingredients": int(per_g_np.shape[0]), "methods": {}}

    def score(name: str, pred_te: np.ndarray) -> None:
        per = {c: metrics(pred_te[:, j], y_all[te, j]) for j, c in enumerate(known_cols)}
        results["methods"][name] = per
        print(f"  {name:13s} " + "  ".join(f"{c.replace('Content', '')[:7]:7s} rho={m['spearman']:.2f}" for c, m in per.items()))

    # Baselines
    zero = ShareModel(per_g_np.shape[0])
    with torch.no_grad():
        score("equal-mass", zero(T(idx_all[te]), per_g, T(cal_all[te])).numpy()[:, [k_index[c] for c in known_cols]])
    score("equal-energy", equal_energy(idx_all[te], per_g_np, cal_all[te])[:, [k_index[c] for c in known_cols]])

    # Learned on all known nutrients
    print("  fitting: all 8 known nutrients")
    cols_all = [k_index[c] for c in known_cols]
    learned = fit(T(idx_all[tr]), per_g, T(cal_all[tr]), y_all[tr], cols_all)
    with torch.no_grad():
        score("learned", learned(T(idx_all[te]), per_g, T(cal_all[te])).numpy()[:, cols_all])

    # Transfer: never sees fibre or sodium
    print("  fitting: 6 nutrients (fibre and sodium held out)")
    train_cols = [c for c in known_cols if c not in HELD_OUT]
    transfer = fit(T(idx_all[tr]), per_g, T(cal_all[tr]), y_all[tr][:, [known_cols.index(c) for c in train_cols]], [k_index[c] for c in train_cols])
    with torch.no_grad():
        score("transfer", transfer(T(idx_all[te]), per_g, T(cal_all[te])).numpy()[:, cols_all])

    # Anchored: start from equal calories, learn small corrections (stronger L2 keeps them small).
    prior = energy_prior(per_g)
    with torch.no_grad():
        score("energy-prior", ShareModel(per_g_np.shape[0], prior)(T(idx_all[te]), per_g, T(cal_all[te])).numpy()[:, cols_all])
    print("  fitting: anchored, 6 nutrients (fibre and sodium held out)")
    anchored_t = fit(T(idx_all[tr]), per_g, T(cal_all[tr]), y_all[tr][:, [known_cols.index(c) for c in train_cols]], [k_index[c] for c in train_cols], prior=prior, l2=2e-3)
    with torch.no_grad():
        score("anchored-transfer", anchored_t(T(idx_all[te]), per_g, T(cal_all[te])).numpy()[:, cols_all])

    transfer_score = lambda m: float(np.mean([results["methods"][m][c]["spearman"] for c in HELD_OUT]))
    results["held_out_nutrient_score"] = {m: transfer_score(m) for m in ["equal-mass", "equal-energy", "energy-prior", "transfer", "anchored-transfer"]}

    # Independent check on the nutrients that matter: recipes matching a USDA prepared dish. Densities per kcal,
    # because serving sizes differ. The estimator for iron/folate/calcium is chosen on this check.
    print("  external check against USDA prepared dishes")
    ref = reference_dishes(rec["Name"])
    ref = ref[usable[ref["row"].to_numpy()]].reset_index(drop=True)
    rr = ref["row"].to_numpy()
    micro_cols = [d["cols"].index(m) for m in MICRO]
    with torch.no_grad():
        preds = {
            "equal-mass": ShareModel(per_g_np.shape[0])(T(idx_all[rr]), per_g, T(cal_all[rr])).numpy(),
            "equal-energy": equal_energy(idx_all[rr], per_g_np, cal_all[rr]),
            "learned": learned(T(idx_all[rr]), per_g, T(cal_all[rr])).numpy(),
            "transfer": transfer(T(idx_all[rr]), per_g, T(cal_all[rr])).numpy(),
            "anchored-transfer": anchored_t(T(idx_all[rr]), per_g, T(cal_all[rr])).numpy(),
        }
    results["external"] = {"recipes": int(len(ref)), "dishes": int(ref["dish"].nunique()),
                           "methods": {m: external_scores(p[:, micro_cols] / cal_all[rr, None], ref) for m, p in preds.items()}}
    chosen = max(results["external"]["methods"], key=lambda m: results["external"]["methods"][m]["within_2x_mean"])
    results["chosen_for_micronutrients"] = chosen
    for m, sc in results["external"]["methods"].items():
        print(f"    {m:18s} within 2x: " + "  ".join(f"{k.split('_')[0]} {sc[k]['within_2x']:.0%}" for k in MICRO) + f"  (mean {sc['within_2x_mean']:.0%})")
    print(f"  {len(ref)} recipes matched to {ref['dish'].nunique()} USDA dishes -> using {chosen}")
    candidates = {"equal-mass": None, "equal-energy": "baseline", "learned": "learned", "transfer": "learned", "anchored-transfer": "anchored"}

    # Export: iron, folate, calcium per recipe with the chosen method (learned ones refitted on all usable recipes).
    mode = candidates[chosen]
    if mode in ("learned", "anchored"):
        print("  final fit on all usable recipes")
        final = fit(T(idx_all[usable]), per_g, T(cal_all[usable]), y_all[usable], cols_all,
                    prior=prior if mode == "anchored" else None, l2=2e-3 if mode == "anchored" else 1e-4)
    else:
        final = ShareModel(per_g_np.shape[0], prior if mode == "prior" else None)
    out = np.full((len(rec), 3), np.nan, dtype=np.float32)
    est = (d["n_match"] >= 1) & has_energy & (cal_all > 0)
    with torch.no_grad():
        for lo in range(0, len(rec), 50_000):
            sl = np.arange(lo, min(lo + 50_000, len(rec)))
            sl = sl[est[sl]]
            if mode == "baseline":
                out[sl] = equal_energy(idx_all[sl], per_g_np, cal_all[sl])[:, micro_cols]
            else:
                out[sl] = final(T(idx_all[sl]), per_g, T(cal_all[sl])).numpy()[:, micro_cols]
    EXPORT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        EXPORT / "micronutrients.npz",
        recipe_id=rec["RecipeId"].to_numpy(dtype=np.int64),
        iron_mg=out[:, 0].astype(np.float16), folate_ug=out[:, 1].astype(np.float16), calcium_mg=out[:, 2].astype(np.float16),
        coverage=np.round(100 * np.clip(frac, 0, 1)).astype(np.uint8),
    )
    w = learned.w.detach().numpy()  # the interpretable one: amounts learned from the labelled nutrients
    names = list(d["vocab"])
    order = np.argsort(w)
    results["typical_amounts"] = {"smallest": [names[i] for i in order[:12]], "largest": [names[i] for i in order[-12:][::-1]]}
    results["micronutrients"] = {m: {"median": float(np.nanmedian(out[:, j])), "p90": float(np.nanpercentile(out[:, j], 90))} for j, m in enumerate(MICRO)}
    results["estimated_recipes"] = int(est.sum())

    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "estimator.json").write_text(json.dumps(results, indent=1))
    lines = ["# Micronutrient estimator", "", f"{results['usable']:,} recipes usable for fitting (of {results['recipes']:,}); "
             f"{results['train']:,} train / {results['test']:,} test; {results['ingredients']:,} ingredients.", "",
             "Spearman correlation between estimated and listed amounts per serving, held-out recipes. "
             "**Transfer** never saw fibre or sodium while fitting: those two columns are the test for nutrients without labels.", "",
             "| Method | " + " | ".join(c.replace("Content", "").replace("Carbohydrate", "Carbs").replace("SaturatedFat", "Sat. fat") for c in known_cols) + " |",
             "|---|" + "---|" * len(known_cols)]
    for name, per in results["methods"].items():
        lines.append(f"| {name} | " + " | ".join(f"{per[c]['spearman']:.2f}" + ("*" if name == "transfer" and c in HELD_OUT else "") for c in known_cols) + " |")
    lines += ["", "\\* not used for fitting.", "",
              "Held-out-nutrient score (mean Spearman on fibre and sodium, methods that never saw them): "
              + ", ".join(f"{m} {v:.3f}" for m, v in results["held_out_nutrient_score"].items())
              + ".", "",
              f"## Independent check: iron, folate and calcium vs USDA prepared dishes", "",
              f"{results['external']['recipes']:,} held-in recipes whose name matches one of {results['external']['dishes']} USDA prepared dishes "
              "(cookies, breads, soups, pizza…). Nutrient per kcal, estimate vs USDA: share within a factor of 2 (median |log2 ratio|).", "",
              "| Method | Iron | Folate | Calcium | Mean within 2× |", "|---|---|---|---|---|"]
    for m, sc in results["external"]["methods"].items():
        lines.append(f"| {m} | " + " | ".join(f"{sc[k]['within_2x']:.0%} ({sc[k]['median_abs_log2']:.2f})" for k in MICRO) + f" | {sc['within_2x_mean']:.0%} |")
    lines += ["", f"**Used for iron, folate and calcium in the app: {chosen}** (best on this check).", "", "Share of held-out recipes estimated within ±30%:", "",
              "| Method | " + " | ".join(c.replace("Content", "") for c in known_cols) + " |", "|---|" + "---|" * len(known_cols)]
    for name, per in results["methods"].items():
        lines.append(f"| {name} | " + " | ".join(f"{per[c]['within_30pct']:.0%}" for c in known_cols) + " |")
    lines += ["", f"Smallest typical amounts: {', '.join(results['typical_amounts']['smallest'])}",
              f"Largest typical amounts: {', '.join(results['typical_amounts']['largest'])}"]
    (RESULTS / "estimator.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nwrote {EXPORT / 'micronutrients.npz'} ({(EXPORT / 'micronutrients.npz').stat().st_size / 1e6:.1f} MB) in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
