"""Daily timing plan: places each medicine's doses into the day so that combinations that must be kept apart
(e.g. thyroid tablets 4 h from iron/calcium, iron 2 h from calcium) are. Doses per day come from the
prescription's frequency text (OD / BD / TDS / 1-0-1 / HS / SOS ...)."""

from __future__ import annotations

import itertools
import re
from typing import Dict, List, Optional, Tuple

SLOTS: List[Tuple[str, str, float]] = [
    ("wake", "On waking (empty stomach)", 7.0),
    ("breakfast", "With breakfast", 8.5),
    ("mid_morning", "Mid-morning", 11.0),
    ("lunch", "With lunch", 13.5),
    ("afternoon", "Afternoon", 16.5),
    ("dinner", "With dinner", 20.0),
    ("bedtime", "At bedtime", 22.0),
]
SLOT_HOURS = {s[0]: s[2] for s in SLOTS}
SLOT_LABEL = {s[0]: s[1] for s in SLOTS}
DEFAULT_PATTERNS = {1: ["breakfast"], 2: ["breakfast", "dinner"], 3: ["breakfast", "lunch", "dinner"], 4: ["breakfast", "lunch", "afternoon", "bedtime"]}


def parse_frequency(text: Optional[str]) -> dict:
    """{"per_day": n, "as_needed": bool, "weekly": bool, "pattern": [slot...] | None, "known": bool}."""
    t = (text or "").lower().strip()
    out = {"per_day": 1, "as_needed": False, "weekly": False, "pattern": None, "known": bool(t)}
    if not t:
        return out
    if re.search(r"\b(sos|prn|as needed|if needed|when needed|when required)\b", t):
        out.update(as_needed=True, per_day=0)
        return out
    if re.search(r"\b(weekly|once a week|every week|per week)\b", t):
        out.update(weekly=True, per_day=0)
        return out
    m = re.search(r"\b([01½])\s*[-–]\s*([01½])\s*[-–]\s*([01½])\b", t)
    if m:
        slots = [s for flag, s in zip(m.groups(), ("breakfast", "lunch", "dinner")) if flag != "0"]
        if slots:
            out.update(per_day=len(slots), pattern=slots)
            return out
    if re.search(r"\b(qid|qds|four times|4 times)\b", t):
        out["per_day"] = 4
    elif re.search(r"\b(tds|tid|thrice|three times|3 times)\b", t):
        out["per_day"] = 3
    elif re.search(r"\b(bd|bid|twice|two times|2 times|12 hourly|every 12)\b", t):
        out["per_day"] = 2
    elif re.search(r"\b(hs|at night|bedtime|night)\b", t):
        out.update(per_day=1, pattern=["bedtime"])
    elif re.search(r"\b(od|once|daily|qd|every day|1 time|morning)\b", t):
        out["per_day"] = 1
    else:
        out["known"] = False
    return out


def _spacing_ok(slots: Tuple[str, ...]) -> bool:
    hours = [SLOT_HOURS[s] for s in slots]
    min_gap = 3.0 if len(slots) >= 3 else 4.0
    return all(b - a >= min_gap for a, b in zip(hours, hours[1:]))


# A prescription's "morning / noon / night" can sit in either slot of its part of the day.
PART_OF_DAY = {"breakfast": ["breakfast", "mid_morning", "wake"], "lunch": ["lunch", "afternoon"], "dinner": ["dinner", "bedtime"], "bedtime": ["bedtime"]}
NOT_PREFERRED = 4


def _options(it: dict) -> List[Tuple[Tuple[str, ...], int]]:
    """Possible slot tuples for one medicine with a preference cost (lower is better)."""
    pref = [s for s in it["preferred"] if s in SLOT_HOURS]
    rank = lambda s: pref.index(s) if s in pref else NOT_PREFERRED  # noqa: E731
    n = min(it["per_day"], 4)
    out: Dict[Tuple[str, ...], int] = {}
    if it["pattern"]:
        groups = [sorted(PART_OF_DAY.get(p, [p]), key=lambda s: (rank(s), PART_OF_DAY.get(p, [p]).index(s))) for p in it["pattern"]]
        for combo in itertools.product(*groups):
            if len(set(combo)) == len(combo):
                key = tuple(sorted(combo, key=SLOT_HOURS.get))
                out[key] = min(out.get(key, 99), sum(rank(s) for s in combo) + sum(g.index(s) for g, s in zip(groups, combo)))
    else:
        pool = list(dict.fromkeys(pref + DEFAULT_PATTERNS[1] + ["lunch", "dinner", "mid_morning", "afternoon", "bedtime", "wake"]))
        for combo in itertools.combinations(pool, n):
            key = tuple(sorted(combo, key=SLOT_HOURS.get))
            if n > 1 and not _spacing_ok(key):
                continue
            # Without a preference, meals are best (wake/bedtime only if needed).
            out[key] = sum(rank(s) if pref else (0 if s in ("breakfast", "lunch", "dinner") else 2) for s in key)
    return sorted(out.items(), key=lambda kv: kv[1])[:16]


def build_plan(items: List[dict], gaps: Dict[Tuple[int, int], float]) -> dict:
    """items: [{"index", "label", "preferred": [slot...], "per_day", "pattern", "as_needed", "weekly", "food"}]
    gaps: {(i, j): hours} for medicines that must be kept apart. Finds the lowest-cost day that keeps every gap
    (small exhaustive search; at most a handful of medicines)."""
    daily = [it for it in items if not it["as_needed"] and not it["weekly"] and it["per_day"] > 0]
    options = {it["index"]: _options(it) for it in daily}
    order = sorted(daily, key=lambda it: (len(options[it["index"]]), -sum(1 for k in gaps if it["index"] in k)))

    def clash(idx: int, slots: Tuple[str, ...], placed: Dict[int, Tuple[str, ...]]) -> bool:
        for other, other_slots in placed.items():
            gap = gaps.get((min(idx, other), max(idx, other)))
            if gap and any(abs(SLOT_HOURS[a] - SLOT_HOURS[b]) < gap for a in slots for b in other_slots):
                return True
        return False

    best: Dict[str, object] = {"cost": float("inf"), "plan": None}
    visits = [0]

    def search(k: int, placed: Dict[int, Tuple[str, ...]], cost: int) -> None:
        visits[0] += 1
        if cost >= best["cost"] or visits[0] > 60000:
            return
        if k == len(order):
            best.update(cost=cost, plan=dict(placed))
            return
        idx = order[k]["index"]
        for slots, c in options[idx]:
            if not clash(idx, slots, placed):
                placed[idx] = slots
                search(k + 1, placed, cost + c)
                del placed[idx]

    search(0, {}, 0)
    notes: List[str] = []
    placed: Dict[int, Tuple[str, ...]] = best["plan"] or {}
    if best["plan"] is None:
        # No arrangement keeps every gap at these frequencies: place greedily and say so.
        for it in order:
            idx = it["index"]
            free = [o for o, _ in options[idx] if not clash(idx, o, placed)]
            placed[idx] = free[0] if free else options[idx][0][0]
            if not free:
                notes.append(f"Couldn't keep {it['label']} far enough apart from another medicine at this frequency. Ask your doctor or pharmacist for the best timing.")

    by_item = {it["index"]: it for it in items}
    slots_out = []
    for slot, label, hour in SLOTS:
        entries = [
            {"index": idx, "label": by_item[idx]["label"], "food": by_item[idx].get("food")}
            for idx, slots in placed.items()
            if slot in slots
        ]
        if entries:
            h, m = int(hour), int(round((hour % 1) * 60))
            slots_out.append({"slot": slot, "label": label, "time": f"{h:02d}:{m:02d}", "items": sorted(entries, key=lambda e: e["index"])})
    return {
        "slots": slots_out,
        "as_needed": [{"index": it["index"], "label": it["label"]} for it in items if it["as_needed"]],
        "weekly": [{"index": it["index"], "label": it["label"]} for it in items if it["weekly"]],
        "notes": notes,
    }
