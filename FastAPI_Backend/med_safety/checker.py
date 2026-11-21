"""Checks a list of medicines for one month of pregnancy: each medicine's pregnancy tier (with reason and
source), clashes between them, and a daily timing plan. Hand-checked knowledge is always the answer;
FDA label tiers fill gaps; the graph model only adds clearly-labelled, unverified signals."""

from __future__ import annotations

from datetime import datetime, timezone
from itertools import combinations
from typing import Dict, List, Optional, Tuple

from .catalog import TIER_RANK, Catalog, Ingredient, Match, get_catalog, trimester_key
from .model_layer import ModelLayer, candidate_names, get_model
from .schedule import build_plan, parse_frequency

CHECK_VERSION = "1.0"
SEVERITY_RANK = {"timing": 0, "caution": 1, "avoid": 2}
DISCLAIMER = (
    "This is a screening aid, not medical advice. It can't replace your doctor or pharmacist, who know your "
    "full history. Never stop or change a prescribed medicine without asking them first."
)
TIER_LABEL = {
    "generally_used": "Commonly used in pregnancy",
    "caution": "Use only if your doctor advises",
    "avoid": "Usually avoided in pregnancy",
    "unknown": "Not enough information",
}


def _worst(tiers: List[str]) -> str:
    return max(tiers, key=lambda t: TIER_RANK.get(t, 1)) if tiers else "unknown"


def _ingredient_view(ing: Ingredient, month: Optional[int], dose: Optional[float]) -> dict:
    low = bool(ing.low_dose_max_mg and dose is not None and dose <= ing.low_dose_max_mg)
    months = [2, 5, 8]  # one month per trimester
    by_tri = {trimester_key(m): ing.tier_for_month(m, low) for m in months}
    tier = ing.tier_for_month(month, low) if month else _worst(list(by_tri.values()))
    return {
        "id": ing.id,
        "name": ing.name,
        "tier": tier,
        "by_trimester": by_tri,
        "note": (ing.low_dose or {}).get("note", ing.note) if low else ing.note,
        "source": ing.source,
        "dont_stop": ing.dont_stop,
        "low_dose": low,
        "classes": ing.classes,
    }


def _rule_matches(side: str, ing: Ingredient) -> bool:
    return side[6:] in ing.classes if side.startswith("class:") else side == ing.id


def check_medicines(
    medicines: List[dict],
    pregnancy_month: Optional[int] = None,
    catalog: Optional[Catalog] = None,
    model: Optional[ModelLayer] = None,
) -> dict:
    """medicines: [{"name": str, "dose"?: str, "frequency"?: str}]"""
    cat = catalog or get_catalog()
    mdl = model or get_model()
    month = pregnancy_month if pregnancy_month and 1 <= pregnancy_month <= 9 else None

    meds_out: List[dict] = []
    resolved: List[Tuple[Optional[Match], List[Ingredient]]] = []
    for i, raw in enumerate(medicines):
        name = str(raw.get("name") or "").strip()
        dose_text = str(raw.get("dose") or "")
        match = cat.resolve(f"{name} {dose_text}".strip()) or cat.resolve(name)
        ings = [cat.ingredients[x] for x in (match.ingredient_ids if match else [])]
        dose = match.product_dose_mg if match else None
        ing_views = [_ingredient_view(g, month, dose) for g in ings]

        entry = {
            "index": i,
            "input": name,
            "dose": dose_text or None,
            "frequency": raw.get("frequency") or None,
            "matched": bool(match),
            "label": match.label if match else name,
            "kind": match.kind if match else None,
            "match_confidence": match.confidence if match else None,
            "ingredients": ing_views,
            "tier": _worst([v["tier"] for v in ing_views]) if ing_views else "unknown",
            "dont_stop": any(v["dont_stop"] for v in ing_views),
            "label_info": None,
            "model": None,
        }
        entry["tier_label"] = TIER_LABEL[entry["tier"]]

        # Not in the hand-checked list: try the FDA label tiers, then the model (signal only).
        if not match:
            names = candidate_names(name, None, [])
            label = mdl.label_tier(names)
            if label:
                entry["label_info"] = label
                entry["tier"] = label.get("tier", "unknown")
                entry["tier_label"] = TIER_LABEL.get(entry["tier"], TIER_LABEL["unknown"])
            idx = mdl.find(names)
            if idx is not None:
                entry["model"] = {"drug": mdl.drug_name(idx), "risk": mdl.risk_probs(idx)}
        meds_out.append(entry)
        resolved.append((match, ings))

    # ---------------------------------------------------------------- interactions
    interactions: List[dict] = []
    gaps: Dict[Tuple[int, int], float] = {}
    for (i, (mi, gi)), (j, (mj, gj)) in combinations(enumerate(resolved), 2):
        if not gi or not gj:
            continue
        seen_rules = set()
        for a in gi:
            for b in gj:
                if a.id == b.id:
                    key = ("dup", a.id)
                    if key not in seen_rules:
                        seen_rules.add(key)
                        interactions.append({
                            "a": i, "b": j, "severity": "caution", "origin": "duplicate",
                            "effect": f"Both contain {a.name.split(' (')[0].lower()}.",
                            "advice": "Taking both may double the dose. Check with your doctor or pharmacist" + (f"; the daily maximum is {int(a.max_daily_mg)} mg." if a.max_daily_mg else "."),
                            "source": "Ingredient check",
                        })
                    continue
                specific = False
                for r_i, rule in enumerate(cat.interactions):
                    hit = (_rule_matches(rule["a"], a) and _rule_matches(rule["b"], b)) or (
                        _rule_matches(rule["a"], b) and _rule_matches(rule["b"], a)
                    )
                    if not hit or r_i in seen_rules:
                        continue
                    seen_rules.add(r_i)
                    specific = specific or rule["severity"] != "timing"
                    interactions.append({
                        "a": i, "b": j, "severity": rule["severity"], "origin": "curated",
                        "effect": rule["effect"], "advice": rule["advice"], "gap_hours": rule.get("gap_hours"),
                        "source": rule.get("source", ""),
                    })
                    if rule.get("gap_hours"):
                        gaps[(i, j)] = max(gaps.get((i, j), 0), float(rule["gap_hours"]))
                # Same drug class (two NSAIDs, two PPIs...), unless a specific rule already explained the pair.
                for cls in set(a.classes) & set(b.classes):
                    if cls in cat.duplicate_classes and not specific and ("dupclass", cls) not in seen_rules:
                        seen_rules.add(("dupclass", cls))
                        interactions.append({
                            "a": i, "b": j, "severity": "caution", "origin": "duplicate",
                            "effect": cat.duplicate_classes[cls], "advice": "Check with your doctor that you need both.",
                            "source": "Drug class check",
                        })

    # Model signals, only for pairs the hand-checked rules say nothing about.
    if mdl.available:
        covered = {(x["a"], x["b"]) for x in interactions}
        model_idx = []
        for (match, ings), med in zip(resolved, meds_out):
            syns = [s for g in ings for s in g.synonyms]
            model_idx.append(mdl.find(candidate_names(med["input"], match.matched_alias if match else None, syns)))
        for i, j in combinations(range(len(meds_out)), 2):
            if (i, j) in covered or model_idx[i] is None or model_idx[j] is None or model_idx[i] == model_idx[j]:
                continue
            score = mdl.pair_score(model_idx[i], model_idx[j])
            if score >= mdl.threshold:
                interactions.append({
                    "a": i, "b": j, "severity": "caution", "origin": "model", "score": round(score, 3),
                    "effect": "Our research model predicts these two may interact. This has not been checked by a clinician.",
                    "advice": "Ask your doctor or pharmacist whether this combination is right for you.",
                    "source": f"Graph model {mdl.meta.get('model', '')} ({mdl.meta.get('version', '')})".strip(),
                })

    interactions.sort(key=lambda x: (-SEVERITY_RANK[x["severity"]], x["origin"] == "model", x["a"], x["b"]))

    # ---------------------------------------------------------------- daily plan
    plan_items = []
    for med, (match, ings) in zip(meds_out, resolved):
        freq = parse_frequency(med["frequency"])
        preferred: List[str] = []
        food = None
        for g in ings:
            preferred += [s for s in g.timing.get("slots", []) if s != "any"]
            food = food or g.timing.get("food")
        plan_items.append({
            "index": med["index"], "label": med["label"], "preferred": list(dict.fromkeys(preferred)),
            "per_day": freq["per_day"], "pattern": freq["pattern"], "as_needed": freq["as_needed"],
            "weekly": freq["weekly"], "food": food,
        })
    schedule = build_plan(plan_items, gaps)
    if any(not parse_frequency(m["frequency"])["known"] for m in meds_out):
        schedule["notes"].append("Where the prescription didn't say how often, we assumed once a day. Follow your prescription.")

    # ---------------------------------------------------------------- summary
    tiers = [m["tier"] for m in meds_out]
    worst_med = _worst(tiers) if tiers else "unknown"
    worst_inter = max((SEVERITY_RANK[x["severity"]] for x in interactions if x["origin"] != "model"), default=-1)
    if worst_med == "avoid" or worst_inter == 2:
        status = "avoid"
    elif worst_med in ("caution", "unknown") or worst_inter == 1 or any(x["origin"] == "model" for x in interactions):
        status = "caution"
    else:
        status = "ok"

    n_avoid = sum(t == "avoid" for t in tiers)
    n_caution = sum(t == "caution" for t in tiers)
    n_unknown = sum(t == "unknown" for t in tiers)
    if not meds_out:
        headline = "Add your medicines to check them."
    elif status == "avoid":
        headline = f"{n_avoid} medicine{'s' if n_avoid != 1 else ''} usually avoided in pregnancy" if n_avoid else "A combination to avoid"
        headline += ". Talk to your doctor soon."
    elif status == "caution":
        parts = []
        if n_caution:
            parts.append(f"{n_caution} to use only if your doctor advises")
        if n_unknown:
            parts.append(f"{n_unknown} we couldn't check")
        n_inter = sum(1 for x in interactions if x["severity"] != "timing")
        if n_inter:
            parts.append(f"{n_inter} combination{'s' if n_inter != 1 else ''} to check")
        headline = ("Check with your doctor: " + ", ".join(parts) + ".") if parts else "Check with your doctor."
    else:
        headline = "These are commonly used in pregnancy" + (" (keep the timing below)." if gaps else ".")

    return {
        "version": CHECK_VERSION,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "pregnancy_month": month,
        "trimester": int(trimester_key(month)[1]) if month else None,
        "status": status,
        "headline": headline,
        "medicines": meds_out,
        "interactions": interactions,
        "schedule": schedule,
        "dont_stop": [m["label"] for m in meds_out if m["dont_stop"]],
        "model": mdl.status(),
        "disclaimer": DISCLAIMER,
    }
