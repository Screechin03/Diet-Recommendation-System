"""Daily meal planner: targets, meal slots, optimiser, vitals/medicine context and the restriction audit."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from meal_plan.context import VitalsContext, apply_medicines, apply_vitals
from meal_plan.planner import MealPlanner
from meal_plan.review import rule_audit
from meal_plan.slots import SLOTS, classify
from meal_plan.targets import daily_targets


def info(**kw):
    base = dict(pregnancy_month=5, age=28, pre_pregnancy_weight=60, current_weight=65, height=162, activity_level="moderate",
                has_gestational_diabetes=False, has_anemia=False, has_constipation=False, has_heartburn=False,
                has_morning_sickness=False, dietary_restrictions=[], food_aversions=[])
    base.update(kw)
    return SimpleNamespace(**base)


def test_targets_follow_trimester_and_conditions():
    t1, t2, t3 = (daily_targets(info(pregnancy_month=m)) for m in (2, 5, 8))
    assert t2.energy_kcal - t1.energy_kcal == pytest.approx(340)
    assert t3.energy_kcal - t1.energy_kcal == pytest.approx(452)
    assert t1.minimums["protein_g"] < t2.minimums["protein_g"]
    assert daily_targets(info(age=17)).minimums["calcium_mg"] == 1300
    gdm = daily_targets(info(has_gestational_diabetes=True))
    assert "carbs_g" in gdm.maximums and gdm.maximums["sugar_g"] < t2.maximums["sugar_g"]


def test_meal_slots_from_names():
    names = pd.Series(["oatmeal pancakes", "chicken curry with rice", "sugar cookies", "garlic sauce", "hummus snack plate"])
    cls = classify(names, np.array([350, 600, 150, 80, 180]))
    assert cls["breakfast"].tolist() == [True, False, False, False, False]
    assert cls["main"].tolist() == [False, True, False, False, False]
    assert cls["snack"][4] and not cls["snack"][2] and not cls["snack"][3]


@pytest.fixture()
def planner(tmp_path):
    rng = np.random.default_rng(0)
    rows = []
    kinds = [("oatmeal porridge", 380), ("vegetable curry", 650), ("fruit salad snack", 180)]
    for i in range(300):
        name, kcal = kinds[i % 3]
        kcal = kcal * rng.uniform(0.8, 1.2)
        rows.append({
            "RecipeId": 1000 + i, "Calories": kcal, "ProteinContent": kcal * rng.uniform(0.02, 0.08),
            "CarbohydrateContent": kcal * 0.12, "FiberContent": kcal * rng.uniform(0.005, 0.02), "SugarContent": kcal * 0.02,
            "SodiumContent": kcal * rng.uniform(0.5, 1.5), "SaturatedFatContent": kcal * 0.004, "FatContent": kcal * 0.03,
            "CholesterolContent": 0.0, "_search": f'{name} {i} c("spinach", "lentils")',
        })
    df = pd.DataFrame(rows)
    n = len(df)
    np.savez(tmp_path / "micro.npz", recipe_id=df["RecipeId"].to_numpy(), iron_mg=rng.uniform(1, 6, n).astype(np.float16),
             folate_ug=rng.uniform(20, 200, n).astype(np.float16), calcium_mg=rng.uniform(50, 400, n).astype(np.float16),
             coverage=np.full(n, 100, dtype=np.uint8))
    return MealPlanner(df, "_search", model_file=str(tmp_path / "micro.npz"))


def test_optimiser_plans_a_valid_day_and_beats_greedy(planner):
    t = daily_targets(info())
    allowed = np.ones(planner.n, dtype=bool)
    best = planner.plan_day(t, allowed, method="milp", seed=1)
    greedy = planner.plan_day(t, allowed, method="greedy", seed=1)
    assert best is not None and set(best.rows) == set(SLOTS)
    assert len(set(best.rows.values())) == len(SLOTS)  # no recipe twice
    assert best.objective <= greedy.objective + 1e-6


def test_optimiser_respects_allowed_rows(planner):
    t = daily_targets(info())
    allowed = np.zeros(planner.n, dtype=bool)
    allowed[::2] = True
    plan = planner.plan_day(t, allowed, seed=3)
    assert plan is not None and all(allowed[r] for r in plan.rows.values())


def test_vitals_and_medicines_change_targets():
    t = daily_targets(info())
    now = datetime.now(timezone.utc).isoformat()
    applied = apply_vitals(t, VitalsContext(recorded_at=now, temp_avg=38.2, spo2_avg=93, status="attention"))
    assert any("Temperature" in a for a in applied) and t.weights["iron_mg"] >= 2.0
    stale = daily_targets(info())
    old = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    assert "weren't used" in apply_vitals(stale, VitalsContext(recorded_at=old, temp_avg=39))[0]
    t2 = daily_targets(info())
    notes = apply_medicines(t2, ["labetalol", "iron", "calcium"], has_gdm=False)
    assert t2.maximums["sodium_mg"] == 1500 and any("different meals" in n for n in notes)


def test_rule_audit_catches_restrictions_but_not_free_from_wording():
    assert "vegan" in rule_audit("butter chicken c(\"chicken\", \"butter\")", ["vegan"], [])
    assert rule_audit("egg-free chocolate cake c(\"cocoa\", \"oil\")", ["egg-free"], []) == []
    assert rule_audit("jell-o salad", ["vegetarian"], []) == ["vegetarian"]
    assert rule_audit("coconut milk curry", ["dairy-free"], []) == []
    assert rule_audit("paneer tikka", [], ["paneer"]) == ["avoids paneer"]


def test_adjust_keeps_most_meals(planner):
    t = daily_targets(info())
    allowed = np.ones(planner.n, dtype=bool)
    base = planner.plan_day(t, allowed, seed=5)
    # New context: a stricter sodium limit and more iron weight.
    t2 = daily_targets(info())
    t2.maximums["sodium_mg"] = 1200.0
    t2.weights["iron_mg"] = 2.0
    adjusted = planner.adjust_day(base.rows, t2, allowed, max_changes=2, seed=5)
    assert adjusted is not None
    changes = sum(adjusted.rows[s] != base.rows[s] for s in SLOTS)
    assert changes <= 2
    # Same targets as before: nothing worth swapping.
    same = planner.adjust_day(base.rows, t, allowed, max_changes=2, seed=5)
    assert same.rows == base.rows
