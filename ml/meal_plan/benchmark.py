"""Step 3: how good are the day plans? Four methods on the same synthetic pregnancy profiles.

    python benchmark.py --profiles 200        # writes results/planner.{md,json}

  knn     what the app did before: the existing recommender's 5 recipes for the profile, eaten as the day's meals
  random  a random breakfast, lunch, dinner and two snacks from the right calorie ranges (same safety filters)
  greedy  the most nutrient-dense recipe for each meal, chosen one meal at a time
  milp    the exact optimiser (meal_plan/planner.py)

Targets met = energy within 10%, each minimum reached to 90%, each limit respected. Protein, fibre, energy, sodium,
saturated fat and sugar come straight from the recipe data; iron, folate and calcium are estimates (estimate.py).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent.parent / "FastAPI_Backend"))

import main as api  # noqa: E402  (the backend: dataset, filters, recommender)
from meal_plan.planner import NUTRIENTS  # noqa: E402
from meal_plan.slots import SLOTS  # noqa: E402
from meal_plan.targets import daily_targets  # noqa: E402

RESTRICTIONS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "egg-free", "nut-free"]


def make_profiles(n: int, seed: int = 0) -> list:
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        month = int(rng.integers(1, 10))
        height = float(rng.normal(160, 7))
        bmi = float(rng.uniform(18.5, 32))
        pre = bmi * (height / 100) ** 2
        restr = []
        if rng.random() < 0.35:
            restr.append("vegetarian")
        for r in RESTRICTIONS[1:]:
            if rng.random() < 0.06:
                restr.append(r)
        out.append(dict(
            pregnancy_month=month, age=int(rng.integers(19, 41)), height=round(height, 1), pre_pregnancy_weight=round(pre, 1),
            current_weight=round(pre + max(0, month - 3) * rng.uniform(1.0, 2.0), 1),
            activity_level=str(rng.choice(["low", "moderate", "high"], p=[0.35, 0.5, 0.15])),
            has_gestational_diabetes=bool(rng.random() < 0.1), has_anemia=bool(rng.random() < 0.25),
            has_constipation=bool(rng.random() < 0.2), has_heartburn=bool(rng.random() < 0.2), has_morning_sickness=bool(rng.random() < 0.2),
            dietary_restrictions=restr, food_aversions=[], medications=[], food_cravings=[],
        ))
    return out


def knn_day(dataset, info) -> list | None:
    candidates = api.exclude_terms(api.apply_dietary_filters(dataset, api.normalize_restrictions(info.dietary_restrictions)), info.food_aversions)
    target = api.calculate_pregnancy_nutrition(info)
    ingredients = api._search_ingredients(info, [], api.normalize_restrictions(info.dietary_restrictions))
    rec = api.recommend(candidates, target, ingredients, {"n_neighbors": 5})
    if rec is None or len(rec) < 5:
        return None
    return [int(i) for i in rec.index[:5]]


def evaluate(planner, rows, t) -> dict:
    totals = dict(zip(NUTRIENTS, planner.totals(rows).tolist()))
    cov = planner.coverage_report(totals, t)
    adequacy = np.mean([min(totals[k] / v, 1.0) for k, v in t.minimums.items()])
    return {
        "met_share": sum(c["met"] for c in cov.values()) / len(cov),
        "met": {k: bool(c["met"]) for k, c in cov.items()},
        "pct": {k: float(c["pct"]) for k, c in cov.items()},
        "adequacy": float(adequacy),
        "energy_err": abs(totals["energy_kcal"] / t.energy_kcal - 1),
        "limits_broken": sum(not cov[k]["met"] for k in t.maximums),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profiles", type=int, default=200)
    ap.add_argument("--week-profiles", type=int, default=20)
    args = ap.parse_args()

    t0 = time.time()
    dataset = api.get_dataset()
    planner = api.get_planner()
    print(f"dataset {len(dataset)} recipes; planner ready in {time.time() - t0:.0f}s; "
          f"pools: breakfast {planner.family['breakfast'].sum()}, main {planner.family['main'].sum()}, snack {planner.family['snack'].sum()}")

    rows_out = []
    for i, p in enumerate(make_profiles(args.profiles)):
        info = api.PregnancyInfo(**p)
        t = daily_targets(info)
        allowed = api._allowed_rows(dataset, planner, info)
        for method in ["knn", "random", "greedy", "milp"]:
            s = time.time()
            if method == "knn":
                rows = knn_day(dataset, info)
            else:
                plan = planner.plan_day(t, allowed, method=method, seed=i)
                rows = list(plan.rows.values()) if plan else None
            secs = time.time() - s
            if rows is None:
                rows_out.append({"profile": i, "method": method, "failed": True})
                continue
            rows_out.append({"profile": i, "method": method, "failed": False, "seconds": secs, "trimester": (p["pregnancy_month"] - 1) // 3 + 1,
                             "vegetarian": "vegetarian" in p["dietary_restrictions"], **evaluate(planner, rows, t)})
        if (i + 1) % 25 == 0:
            print(f"  {i + 1} profiles ({time.time() - t0:.0f}s)", flush=True)

    df = pd.DataFrame(rows_out)
    ok = df[~df["failed"]]
    met = pd.json_normalize(ok["met"]).set_index(ok.index)
    pct = pd.json_normalize(ok["pct"]).set_index(ok.index)
    nutrients = ["energy_kcal", "protein_g", "fiber_g", "iron_mg", "folate_ug", "calcium_mg", "sodium_mg", "satfat_g", "sugar_g"]
    order = ["knn", "random", "greedy", "milp"]
    summary = {}
    for m in order:
        sel = ok[ok["method"] == m]
        summary[m] = {
            "plans": int(len(sel)), "failed": int(df[(df["method"] == m) & df["failed"]].shape[0]),
            "targets_met_pct": float(100 * sel["met_share"].mean()),
            "all_met_pct": float(100 * (sel["met_share"] == 1).mean()),
            "adequacy_pct": float(100 * sel["adequacy"].mean()),
            "energy_err_pct": float(100 * sel["energy_err"].median()),
            "limits_broken_per_day": float(sel["limits_broken"].mean()),
            "seconds_median": float(sel["seconds"].median()),
            "per_nutrient_met_pct": {k: float(100 * met.loc[sel.index, k].mean()) for k in nutrients if k in met},
            "per_nutrient_pct_of_target": {k: float(pct.loc[sel.index, k].mean()) for k in nutrients if k in pct},
            "by_trimester_targets_met_pct": {int(k): float(100 * v) for k, v in sel.groupby("trimester")["met_share"].mean().items()},
        }
        print(f"{m:7s} targets met {summary[m]['targets_met_pct']:.1f}%  all met {summary[m]['all_met_pct']:.1f}%  "
              f"adequacy {summary[m]['adequacy_pct']:.1f}%  energy err {summary[m]['energy_err_pct']:.1f}%  {summary[m]['seconds_median']*1000:.0f} ms")

    # Week plans: 7 days without repeating a recipe.
    week = []
    for i, p in enumerate(make_profiles(args.week_profiles, seed=99)):
        info = api.PregnancyInfo(**p)
        t = daily_targets(info)
        allowed = api._allowed_rows(dataset, planner, info)
        used = np.zeros(len(dataset), dtype=bool)
        s = time.time()
        shares = []
        for d in range(7):
            plan = planner.plan_day(t, allowed & ~used, seed=1000 * i + d)
            if plan is None:
                break
            used[list(plan.rows.values())] = True
            shares.append(evaluate(planner, list(plan.rows.values()), t)["met_share"])
        week.append({"days": len(shares), "targets_met_pct": 100 * float(np.mean(shares)) if shares else 0, "seconds": time.time() - s,
                     "day7_targets_met_pct": 100 * shares[-1] if len(shares) == 7 else None})
    wk = pd.DataFrame(week)
    week_summary = {"profiles": len(wk), "complete_weeks_pct": float(100 * (wk["days"] == 7).mean()),
                    "targets_met_pct": float(wk["targets_met_pct"].mean()), "day7_targets_met_pct": float(wk["day7_targets_met_pct"].dropna().mean()),
                    "seconds_per_week_median": float(wk["seconds"].median())}
    print("week:", week_summary)

    out = HERE / "results"
    out.mkdir(exist_ok=True)
    (out / "planner.json").write_text(json.dumps({"profiles": args.profiles, "methods": summary, "week": week_summary}, indent=1))
    names = {"knn": "Similar recipes (current app)", "random": "Random meals", "greedy": "Greedy, meal by meal", "milp": "Optimiser (MILP)"}
    short = {"energy_kcal": "Energy", "protein_g": "Protein", "fiber_g": "Fibre", "iron_mg": "Iron*", "folate_ug": "Folate*", "calcium_mg": "Calcium*",
             "sodium_mg": "Sodium ≤", "satfat_g": "Sat. fat ≤", "sugar_g": "Sugar ≤"}
    lines = [f"# Day-plan benchmark", "", f"{args.profiles} synthetic pregnancy profiles (all trimesters, 35% vegetarian, common conditions). "
             "A target is met when energy is within 10%, a minimum reaches 90% and a limit is respected.", "",
             "| Method | Targets met | All met | Mean adequacy | Energy error | Limits broken / day | Time |", "|---|---|---|---|---|---|---|"]
    for m in order:
        s = summary[m]
        lines.append(f"| {names[m]} | {s['targets_met_pct']:.1f}% | {s['all_met_pct']:.1f}% | {s['adequacy_pct']:.1f}% | {s['energy_err_pct']:.1f}% | {s['limits_broken_per_day']:.2f} | {s['seconds_median']*1000:.0f} ms |")
    lines += ["", "Share of days meeting each target:", "", "| Method | " + " | ".join(short[k] for k in nutrients) + " |", "|---|" + "---|" * len(nutrients)]
    for m in order:
        pn = summary[m]["per_nutrient_met_pct"]
        lines.append(f"| {names[m]} | " + " | ".join(f"{pn.get(k, float('nan')):.0f}%" for k in nutrients) + " |")
    lines += ["", "Average day as % of each target (minimums: higher is better; limits marked ≤: at most 100%):", "",
              "| Method | " + " | ".join(short[k] for k in nutrients) + " |", "|---|" + "---|" * len(nutrients)]
    for m in order:
        pc = summary[m]["per_nutrient_pct_of_target"]
        lines.append(f"| {names[m]} | " + " | ".join(f"{pc.get(k, float('nan')):.0f}%" for k in nutrients) + " |")
    lines += ["", "\\* estimated from ingredients and calibrated against USDA prepared dishes (see estimator.md, calibration.md).", "",
              f"Week plans (7 days, no recipe repeated, {week_summary['profiles']} profiles): {week_summary['complete_weeks_pct']:.0f}% complete, "
              f"{week_summary['targets_met_pct']:.1f}% of targets met on average, {week_summary['day7_targets_met_pct']:.1f}% on day 7; "
              f"{week_summary['seconds_per_week_median']:.1f} s per week."]
    (out / "planner.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
