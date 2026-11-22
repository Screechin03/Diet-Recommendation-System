"""Day plans from the recipe collection: one breakfast, lunch, dinner and two snacks that together meet the day's
pregnancy targets as closely as possible.

Exact method (`milp`): a mixed-integer linear programme solved by HiGHS (scipy.optimize.milp).
  variables   x[slot, recipe] in {0,1}; shortfall u_k >= 0 per minimum; excess v_k >= 0 per maximum;
              energy slack below/above a +-5% band
  constraints one recipe per slot; a recipe at most once a day; nutrient sums with the slacks
  objective   sum_k w_k u_k / target_k + 3 sum_k v_k / limit_k + 2 (energy slack) / energy  - tiny variety jitter
Baselines for the study: `greedy` (best nutrient density per slot, picked independently) and `random`.

Each slot only considers a shortlist (best nutrient density for its calorie range, plus a random part for variety),
which keeps the programme small (~600 binaries, solved in well under a second).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

import numpy as np
import pandas as pd
from scipy.optimize import LinearConstraint, milp
from scipy.sparse import lil_matrix

from .slots import SLOT_SHARE, SLOTS, classify, recipe_names
from .targets import Targets

MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
MODEL_FILE = os.path.join(MODEL_DIR, "micronutrients.npz")
CALIBRATION_FILE = os.path.join(MODEL_DIR, "calibration.json")

COLUMNS = {  # recipe column -> nutrient key
    "Calories": "energy_kcal", "ProteinContent": "protein_g", "CarbohydrateContent": "carbs_g", "FiberContent": "fiber_g",
    "SugarContent": "sugar_g", "SodiumContent": "sodium_mg", "SaturatedFatContent": "satfat_g",
}
MICRO = ["iron_mg", "folate_ug", "calcium_mg"]
NUTRIENTS = list(COLUMNS.values()) + MICRO
SHORTLIST = 140


@dataclass
class DayPlan:
    rows: Dict[str, int]          # slot -> dataset row
    totals: Dict[str, float]
    objective: float
    method: str


class MealPlanner:
    def __init__(self, dataset: pd.DataFrame, search_column: str, model_file: str = MODEL_FILE):
        n = len(dataset)
        self.n = n
        cal = dataset["Calories"].to_numpy(dtype=float)
        A = np.zeros((n, len(NUTRIENTS)), dtype=np.float64)
        for j, col in enumerate(COLUMNS):
            A[:, j] = dataset[col].to_numpy(dtype=float)
        micro = np.load(model_file)
        pos = pd.Series(np.arange(len(micro["recipe_id"])), index=micro["recipe_id"])
        pos = pos[~pos.index.duplicated()]
        ids = dataset["RecipeId"].to_numpy(dtype=np.int64)
        where = pos.reindex(ids).to_numpy()
        found = ~np.isnan(where)
        w = np.where(found, where, 0).astype(int)
        for j, key in enumerate(MICRO):
            vals = micro[key].astype(np.float64)[w]
            A[:, len(COLUMNS) + j] = np.where(found, vals, np.nan)
        coverage = np.where(found, micro["coverage"][w], 0)
        # Calibrate against USDA prepared dishes (ml/meal_plan/calibrate.py): the raw estimates run high, most of all
        # the highest ones, which are exactly the ones an optimiser would pick.
        if os.path.exists(CALIBRATION_FILE):
            import json

            params = json.load(open(CALIBRATION_FILE))["params"]
            for j, key in enumerate(MICRO):
                if key in params:
                    col = A[:, len(COLUMNS) + j]
                    ok = np.isfinite(col) & (col > 0) & (cal > 0)
                    per_kcal = np.where(ok, col / np.where(cal > 0, cal, 1), 1.0)
                    a, b = params[key]["a"], params[key]["b"]
                    A[:, len(COLUMNS) + j] = np.where(ok, cal * np.exp2(a + b * np.log2(per_kcal)), col)
        self.A = A
        self.coverage = coverage
        names = recipe_names(dataset[search_column])
        cls = classify(names, cal)
        reliable = found & np.isfinite(A).all(1) & (coverage >= 60) & (cal > 0)
        # Ignore implausible estimates (top 1% per micronutrient): one outlier must not "solve" a whole day.
        for j in range(len(COLUMNS), len(NUTRIENTS)):
            col = A[:, j]
            cap = np.nanpercentile(col[found], 99)
            reliable &= ~(col > cap)
        self.family = {"breakfast": cls["breakfast"] & reliable, "main": cls["main"] & reliable, "snack": cls["snack"] & reliable}
        self.spicy = cls["spicy"]
        self.index = {k: j for j, k in enumerate(NUTRIENTS)}
        self.index["fiber_cap_g"] = self.index["fiber_g"]  # upper limit on the same column

    # ------------------------------------------------------------------------------------------------------
    @staticmethod
    def slot_family(slot: str) -> str:
        return "breakfast" if slot == "breakfast" else "snack" if slot.startswith("snack") else "main"

    def density(self, rows: np.ndarray, t: Targets, share: float) -> np.ndarray:
        """How much of the slot's share of each target a recipe brings, minus overshoot on limits."""
        A = self.A[rows]
        score = np.zeros(len(rows))
        for k, target in t.minimums.items():
            score += t.weights.get(k, 1.0) * np.minimum(A[:, self.index[k]] / (target * share), 1.5)
        for k, limit in t.maximums.items():
            score -= 1.5 * np.maximum(A[:, self.index[k]] / (limit * share) - 1, 0)
        e = A[:, self.index["energy_kcal"]] / (t.energy_kcal * share)
        return score - 0.8 * np.abs(e - 1)

    def pool(self, slot: str, t: Targets, allowed: np.ndarray) -> np.ndarray:
        """Every allowed recipe of the right kind and calorie range for this meal."""
        e_slot = t.energy_kcal * SLOT_SHARE[slot]
        cal = self.A[:, self.index["energy_kcal"]]
        lo, hi = max(60.0, 0.55 * e_slot), 1.7 * e_slot
        return np.flatnonzero(allowed & self.family[self.slot_family(slot)] & (cal >= lo) & (cal <= hi))

    def shortlist(self, slot: str, t: Targets, allowed: np.ndarray, rng: np.random.Generator, size: int = SHORTLIST) -> np.ndarray:
        share = SLOT_SHARE[slot]
        rows = self.pool(slot, t, allowed)
        if len(rows) == 0:
            return rows
        s = self.density(rows, t, share)
        top = rows[np.argsort(-s)[: 4 * size]]
        keep = top[: size // 4]
        rest = top[size // 4:]
        if len(rest) > size - len(keep):
            rest = rng.choice(rest, size - len(keep), replace=False)
        return np.concatenate([keep, rest])

    # ------------------------------------------------------------------------------------------------------
    def objective(self, totals: np.ndarray, t: Targets) -> float:
        obj = 0.0
        for k, target in t.minimums.items():
            obj += t.weights.get(k, 1.0) * max(target - totals[self.index[k]], 0) / target
        for k, limit in t.maximums.items():
            obj += 3 * max(totals[self.index[k]] - limit, 0) / limit
        e = totals[self.index["energy_kcal"]]
        obj += 2 * (max(0.95 * t.energy_kcal - e, 0) + max(e - 1.05 * t.energy_kcal, 0)) / t.energy_kcal
        return obj

    def totals(self, rows: Sequence[int]) -> np.ndarray:
        return self.A[list(rows)].sum(0)

    def plan_day(self, t: Targets, allowed: np.ndarray, method: str = "milp", seed: int = 0, time_limit: float = 5.0) -> Optional[DayPlan]:
        rng = np.random.default_rng(seed)
        lists = {s: self.shortlist(s, t, allowed, rng) for s in SLOTS}
        if any(len(v) == 0 for v in lists.values()):
            return None
        if method == "random":
            pick = {}
            for s in SLOTS:
                options = self.pool(s, t, allowed)
                r = int(rng.choice(options))
                while r in pick.values() and len(options) > len(SLOTS):
                    r = int(rng.choice(options))
                pick[s] = r
        elif method == "greedy":
            pick = {}
            for s in SLOTS:
                order = lists[s][np.argsort(-self.density(lists[s], t, SLOT_SHARE[s]))]
                pick[s] = int(next(r for r in order if r not in pick.values()))
        else:
            pick = self._milp(lists, t, rng, time_limit)
            if pick is None:
                return None
        tot = self.totals(pick.values())
        return DayPlan(pick, dict(zip(NUTRIENTS, tot.round(2).tolist())), round(self.objective(tot, t), 4), method)

    def adjust_day(self, current: Dict[str, int], t: Targets, allowed: np.ndarray, max_changes: int = 2,
                   change_cost: float = 0.05, seed: int = 0, time_limit: float = 5.0) -> Optional[DayPlan]:
        """Re-fit an existing day to new targets (fresh vitals, new medicines) with as few swaps as possible:
        keeping a meal is free, each swap costs `change_cost` in the objective, and at most `max_changes` swaps."""
        rng = np.random.default_rng(seed)
        lists = {}
        for s in SLOTS:
            base = self.shortlist(s, t, allowed, rng)
            keep = current.get(s)
            lists[s] = base if keep is None or keep in base else np.concatenate([[keep], base])
        pick = self._milp(lists, t, rng, time_limit, keep=current, change_cost=change_cost, max_changes=max_changes)
        if pick is None:
            return None
        tot = self.totals(pick.values())
        return DayPlan(pick, dict(zip(NUTRIENTS, tot.round(2).tolist())), round(self.objective(tot, t), 4), "adjust")

    def _milp(self, lists: Dict[str, np.ndarray], t: Targets, rng: np.random.Generator, time_limit: float,
              keep: Optional[Dict[str, int]] = None, change_cost: float = 0.0, max_changes: int = len(SLOTS)) -> Optional[Dict[str, int]]:
        cols = [(s, int(r)) for s in SLOTS for r in lists[s]]
        keep = keep or {}
        kept_cols = [j for j, (s, r) in enumerate(cols) if keep.get(s) == r]
        nx = len(cols)
        mins, maxs = list(t.minimums), list(t.maximums)
        nu, nv = len(mins), len(maxs)
        nvar = nx + nu + nv + 2
        c = np.zeros(nvar)
        c[:nx] = -0.002 * rng.random(nx)  # tie-break for variety
        for j in kept_cols:
            c[j] -= change_cost  # keeping today's meal is rewarded: swaps must earn their place
        for i, k in enumerate(mins):
            c[nx + i] = t.weights.get(k, 1.0) / t.minimums[k]
        for i, k in enumerate(maxs):
            c[nx + nu + i] = 3 / t.maximums[k]
        c[nx + nu + nv:] = 2 / t.energy_kcal

        by_recipe: Dict[int, List[int]] = {}
        for j, (_, r) in enumerate(cols):
            by_recipe.setdefault(r, []).append(j)
        shared = [js for js in by_recipe.values() if len(js) > 1]
        nrow = len(SLOTS) + len(shared) + nu + nv + 2 + (1 if kept_cols else 0)
        M = lil_matrix((nrow, nvar))
        lb = np.full(nrow, -np.inf)
        ub = np.full(nrow, np.inf)
        row = 0
        for s in SLOTS:
            for j, (slot, _) in enumerate(cols):
                if slot == s:
                    M[row, j] = 1
            lb[row] = ub[row] = 1
            row += 1
        for js in shared:
            for j in js:
                M[row, j] = 1
            ub[row] = 1
            row += 1
        rows_x = np.array([r for _, r in cols])
        for i, k in enumerate(mins):
            M[row, :nx] = self.A[rows_x, self.index[k]]
            M[row, nx + i] = 1
            lb[row] = t.minimums[k]
            row += 1
        for i, k in enumerate(maxs):
            M[row, :nx] = self.A[rows_x, self.index[k]]
            M[row, nx + nu + i] = -1
            ub[row] = t.maximums[k]
            row += 1
        energy = self.A[rows_x, self.index["energy_kcal"]]
        M[row, :nx] = energy
        M[row, nx + nu + nv] = 1
        lb[row] = 0.95 * t.energy_kcal
        row += 1
        M[row, :nx] = energy
        M[row, nx + nu + nv + 1] = -1
        ub[row] = 1.05 * t.energy_kcal
        if kept_cols:  # at most `max_changes` meals swapped
            row += 1
            for j in kept_cols:
                M[row, j] = 1
            lb[row] = len(kept_cols) - max_changes

        integrality = np.r_[np.ones(nx), np.zeros(nvar - nx)]
        bounds_lo = np.zeros(nvar)
        bounds_hi = np.r_[np.ones(nx), np.full(nvar - nx, np.inf)]
        from scipy.optimize import Bounds

        res = milp(c, constraints=LinearConstraint(M.tocsr(), lb, ub), integrality=integrality,
                   bounds=Bounds(bounds_lo, bounds_hi), options={"time_limit": time_limit, "disp": False})
        if res.x is None:
            return None
        chosen = np.flatnonzero(res.x[:nx] > 0.5)
        pick = {cols[j][0]: cols[j][1] for j in chosen}
        return pick if len(pick) == len(SLOTS) else None

    def alternatives(self, plan: DayPlan, slot: str, t: Targets, allowed: np.ndarray, k: int = 5, seed: int = 1) -> List[int]:
        """Best replacements for one meal, keeping the other four."""
        rng = np.random.default_rng(seed)
        others = [r for s, r in plan.rows.items() if s != slot]
        base = self.totals(others)
        options = [int(r) for r in self.shortlist(slot, t, allowed, rng, size=300) if r not in plan.rows.values()]
        scored = sorted(options, key=lambda r: self.objective(base + self.A[r], t))
        return scored[:k]

    def coverage_report(self, totals: Dict[str, float], t: Targets) -> Dict[str, dict]:
        out = {"energy_kcal": {"value": totals["energy_kcal"], "target": round(t.energy_kcal), "kind": "range",
                               "pct": round(100 * totals["energy_kcal"] / t.energy_kcal), "met": abs(totals["energy_kcal"] / t.energy_kcal - 1) <= 0.10}}
        for k, target in t.minimums.items():
            out[k] = {"value": totals[k], "target": round(target, 1), "kind": "min", "pct": round(100 * totals[k] / target), "met": totals[k] >= 0.9 * target}
        for k, limit in t.maximums.items():
            v = totals["fiber_g"] if k == "fiber_cap_g" else totals[k]
            out[k] = {"value": v, "target": round(limit, 1), "kind": "max", "pct": round(100 * v / limit), "met": v <= limit}
        return out
