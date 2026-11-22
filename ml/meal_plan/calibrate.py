"""Step 2b: calibrate the iron/folate/calcium estimates against USDA prepared dishes.

    python calibrate.py              # writes results/calibration.{md,json} and the app's model/calibration.json

Why: an optimiser picks the recipes with the highest estimates, and those are the most over-estimated ones
(the "optimiser's curse"). Uncalibrated, the top 20% of estimates are ~3x too high, so plans look iron-rich on
paper only. Fix: per nutrient, a log-linear map  log2(true per kcal) = a + b * log2(estimate per kcal), fitted on
half of the reference dishes and tested on the other half (split by dish, so no dish is in both halves).
b < 1 pulls high estimates down more than low ones.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from estimate import EXPORT, MICRO, RESULTS, reference_dishes
from ingredients import read_recipes

SEED = 0


def fit_line(x: np.ndarray, y: np.ndarray) -> tuple:
    """Least squares on log2 values, with the 1st/99th percentiles clipped so a few odd matches don't steer it."""
    lo, hi = np.percentile(x, [1, 99])
    x = np.clip(x, lo, hi)
    b, a = np.polyfit(x, y, 1)
    return float(a), float(b)


def scores(est: np.ndarray, true: np.ndarray) -> dict:
    lr = np.log2(est / true)
    top = est >= np.quantile(est, 0.8)
    return {"within_2x": float((np.abs(lr) <= 1).mean()), "median_bias": float(2 ** np.median(lr)), "top20_bias": float(2 ** np.median(lr[top]))}


def main() -> None:
    rec = read_recipes(usecols=["RecipeId", "Name", "Calories"])
    z = np.load(EXPORT / "micronutrients.npz")
    est = pd.DataFrame({m: z[m].astype(float) for m in MICRO})
    est["RecipeId"] = z["recipe_id"]
    rec = rec.merge(est, on="RecipeId", how="left")
    ref = reference_dishes(rec["Name"])
    r = rec.iloc[ref["row"].to_numpy()].reset_index(drop=True)

    dishes = ref["dish"].unique()
    rng = np.random.default_rng(SEED)
    rng.shuffle(dishes)
    fit_dishes = set(dishes[: len(dishes) // 2])
    in_fit = ref["dish"].isin(fit_dishes).to_numpy()

    out = {"recipes": int(len(ref)), "dishes": int(len(dishes)), "nutrients": {}}
    params = {}
    lines = ["# Calibration of iron, folate and calcium estimates", "",
             f"{len(ref):,} recipes matched to {len(dishes)} USDA prepared dishes; correction fitted on half the dishes, "
             "tested on the other half. Bias = estimate / USDA (1.00 = unbiased); top 20% = the highest estimates, which an optimiser picks.", "",
             "| Nutrient | Within 2× before → after | Median bias before → after | Top-20% bias before → after | a | b |", "|---|---|---|---|---|---|"]
    for m in MICRO:
        e = (r[m] / r["Calories"]).to_numpy()
        u = ref[m].to_numpy()
        ok = np.isfinite(e) & (e > 0) & (u > 0)
        a, b = fit_line(np.log2(e[ok & in_fit]), np.log2(u[ok & in_fit]))
        test = ok & ~in_fit
        before = scores(e[test], u[test])
        after = scores(2 ** (a + b * np.log2(e[test])), u[test])
        out["nutrients"][m] = {"a": a, "b": b, "test_recipes": int(test.sum()), "before": before, "after": after}
        lines.append(f"| {m.split('_')[0].title()} | {before['within_2x']:.0%} → {after['within_2x']:.0%} | {before['median_bias']:.2f} → {after['median_bias']:.2f} | "
                     f"{before['top20_bias']:.2f} → {after['top20_bias']:.2f} | {a:.2f} | {b:.2f} |")
        # Production: refit on all reference dishes.
        params[m] = dict(zip(("a", "b"), fit_line(np.log2(e[ok]), np.log2(u[ok]))))
    (EXPORT / "calibration.json").write_text(json.dumps({"form": "log2(per_kcal_true) = a + b*log2(per_kcal_estimate)", "params": params}, indent=1))
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "calibration.json").write_text(json.dumps(out, indent=1))
    (RESULTS / "calibration.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
