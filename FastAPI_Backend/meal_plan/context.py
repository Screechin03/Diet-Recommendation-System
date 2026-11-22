"""Links the meal plan to the rest of the app: the latest vital-sign readings and the medicines the patient takes
change the day's targets and add timing advice. Every change is explained back to the patient ("applied")."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional

from pydantic import BaseModel

from .targets import Targets

STALE_HOURS = 24


class VitalsContext(BaseModel):
    """Summary of the latest vitals analysis (the app sends what it has; everything is optional)."""
    recorded_at: Optional[str] = None
    status: Optional[str] = None            # normal / attention / urgent / insufficient
    hr_avg: Optional[float] = None
    spo2_avg: Optional[float] = None
    temp_avg: Optional[float] = None
    activity: Optional[str] = None          # rest / exercise


def _hours_since(iso: Optional[str]) -> Optional[float]:
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - t).total_seconds() / 3600


def apply_vitals(t: Targets, v: Optional[VitalsContext]) -> List[str]:
    if v is None:
        return []
    age = _hours_since(v.recorded_at)
    if age is not None and age > STALE_HOURS:
        return [f"Your last vital signs are {int(age // 24)} day(s) old, so they weren't used. Record fresh readings for a plan that follows them."]
    applied: List[str] = []
    if v.status == "urgent":
        applied.append("Your latest readings need a doctor's attention. This meal plan doesn't replace that call.")
    if v.temp_avg is not None and v.temp_avg >= 37.8:
        t.notes.append("Raised temperature: drink extra fluids through the day and prefer light, easy-to-digest meals. Call your doctor about a fever.")
        applied.append(f"Temperature {v.temp_avg:.1f} °C: extra fluids and lighter meals suggested.")
    if v.spo2_avg is not None and v.spo2_avg < 95:
        t.weights["iron_mg"] = max(t.weights.get("iron_mg", 1.0), 2.0)
        applied.append(f"Oxygen saturation {v.spo2_avg:.0f}%: iron-rich meals are favoured (iron carries oxygen). Mention the reading to your doctor.")
    if v.hr_avg is not None and v.hr_avg > 100 and (v.activity or "rest") == "rest":
        t.weights["fiber_g"] = max(t.weights.get("fiber_g", 0.8), 1.2)
        t.maximums["sodium_mg"] = min(t.maximums["sodium_mg"], 2000.0)
        t.notes.append("Fast resting heart rate: stay hydrated, keep caffeine low and favour fruit and vegetables.")
        applied.append(f"Resting heart rate {v.hr_avg:.0f} bpm: more fruit and vegetables, less salt, low caffeine.")
    if not applied and v.status in ("normal", None) and (v.hr_avg or v.spo2_avg or v.temp_avg):
        applied.append("Your latest vital signs are in the usual range: no changes needed.")
    return applied


# medicine ingredient id -> (target change, advice)
def apply_medicines(t: Targets, ingredient_ids: Iterable[str], has_gdm: bool) -> List[str]:
    ids = set(ingredient_ids)
    applied: List[str] = []
    if "iron" in ids:
        applied.append("Iron tablets: take them with water or a vitamin C food (orange, lemon, guava), at least 2 hours away from milk, curd, calcium tablets, tea and coffee.")
    if "calcium" in ids and "iron" in ids:
        applied.append("Calcium and iron tablets block each other: take them at different meals.")
    elif "calcium" in ids:
        applied.append("Calcium tablets: take them with a meal; this plan's dairy and greens add to them.")
    if "levothyroxine" in ids:
        applied.append("Thyroid tablet: take it on an empty stomach and wait 30-60 minutes before breakfast; keep soy and very high-fibre foods away from the dose.")
    if ids & {"metformin", "insulin", "glibenclamide"}:
        if not has_gdm:
            t.maximums["sugar_g"] = min(t.maximums["sugar_g"], 0.08 * t.energy_kcal / 4)
            t.maximums["carbs_g"] = 0.45 * t.energy_kcal / 4
        applied.append("Diabetes medicine: sugar and carbohydrate are capped and spread over five meals. Don't skip meals.")
    if ids & {"labetalol", "nifedipine", "methyldopa"}:
        t.maximums["sodium_mg"] = min(t.maximums["sodium_mg"], 1500.0)
        applied.append("Blood-pressure medicine: salt is kept under 1,500 mg of sodium a day.")
    if ids & {"antacid", "omeprazole", "pantoprazole", "famotidine", "ranitidine"} and "iron" in ids:
        applied.append("Antacids reduce iron absorption: take iron at least 2 hours apart from them.")
    if ids & {"doxylamine", "pyridoxine", "ondansetron"}:
        applied.append("Nausea medicine: small meals and snacks every 2-3 hours usually sit better than three large meals.")
    if "folic_acid" in ids:
        applied.append("Folic acid tablet: keep taking it; the plan's folate is on top of it.")
    return applied


def resolve_medicines(names: List[str]) -> Dict[str, List[str]]:
    """Medicine names -> catalogue ingredient ids (unknown names are ignored)."""
    from med_safety.catalog import get_catalog

    catalog = get_catalog()
    out: Dict[str, List[str]] = {}
    for name in names[:30]:
        m = catalog.resolve(name)
        if m is not None:
            out[name] = list(m.ingredient_ids)
    return out
