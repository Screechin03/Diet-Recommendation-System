"""Daily nutrient targets in pregnancy.

Sources: US Institute of Medicine Dietary Reference Intakes for pregnancy (energy increments, protein, iron, folate,
calcium, fibre), Dietary Guidelines for Americans 2020-25 (sodium, saturated fat), ICMR-NIN 2020 (similar values
for Indian women). Energy uses Mifflin-St Jeor resting energy on pre-pregnancy weight, an activity factor and the
trimester increment, so it is an estimate: weight gain and the doctor's advice come first.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

ACTIVITY = {"low": 1.4, "moderate": 1.55, "high": 1.75}
TRIMESTER_EXTRA_KCAL = {1: 0, 2: 340, 3: 452}


@dataclass
class Targets:
    energy_kcal: float
    minimums: Dict[str, float]          # reach at least (protein_g, fiber_g, iron_mg, folate_ug, calcium_mg)
    maximums: Dict[str, float]          # stay under (sodium_mg, satfat_g, sugar_g, carbs_g when relevant)
    weights: Dict[str, float] = field(default_factory=dict)  # importance of each shortfall
    notes: list = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"energy_kcal": round(self.energy_kcal), "minimums": {k: round(v, 1) for k, v in self.minimums.items()},
                "maximums": {k: round(v, 1) for k, v in self.maximums.items()}, "notes": self.notes}


def trimester(month: int) -> int:
    return 1 if month <= 3 else 2 if month <= 6 else 3


def daily_targets(info) -> Targets:
    """`info` is the API's PregnancyInfo (pregnancy_month, age, weights, height, conditions, activity_level)."""
    tri = trimester(info.pregnancy_month)
    bmr = 10 * info.pre_pregnancy_weight + 6.25 * info.height - 5 * info.age - 161
    energy = bmr * ACTIVITY.get(info.activity_level, 1.55) + TRIMESTER_EXTRA_KCAL[tri]
    energy = min(max(energy, 1700), 3200)

    protein = max(46.0, 0.8 * info.current_weight) if tri == 1 else max(71.0, 1.1 * info.current_weight)
    minimums = {
        "protein_g": protein,
        "fiber_g": 28.0,
        "iron_mg": 27.0,
        "folate_ug": 600.0,
        "calcium_mg": 1300.0 if info.age < 19 else 1000.0,
    }
    maximums = {
        "sodium_mg": 2300.0,
        "satfat_g": 0.10 * energy / 9,
        "sugar_g": 0.15 * energy / 4,  # total sugars (incl. fruit and milk), so looser than the 10% free-sugar limit
        "fiber_cap_g": 50.0,           # about twice the target: more tends to cause bloating and discomfort
    }
    weights = {"protein_g": 1.0, "fiber_g": 0.8, "iron_mg": 1.0, "folate_ug": 1.0, "calcium_mg": 0.9}
    notes = []
    if info.has_gestational_diabetes:
        maximums["sugar_g"] = 0.08 * energy / 4
        maximums["carbs_g"] = 0.45 * energy / 4
        notes.append("Gestational diabetes: sugar and carbohydrate are capped and spread across the day.")
    if info.has_anemia:
        weights["iron_mg"] = 2.0
        notes.append("Anaemia: iron-rich meals are favoured. Keep taking iron tablets as prescribed.")
    if info.has_constipation:
        minimums["fiber_g"] = 32.0
        weights["fiber_g"] = 1.6
        notes.append("Constipation: more fibre. Drink plenty of water with it.")
    if info.has_heartburn:
        notes.append("Heartburn: very spicy dishes are left out.")
    notes.append("Iron and folate needs in pregnancy are hard to meet from food alone; prenatal supplements usually fill the gap.")
    return Targets(energy, minimums, maximums, weights, notes)
