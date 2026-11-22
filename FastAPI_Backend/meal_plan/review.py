"""Second opinion and fallback with Gemini, on top of the optimiser (which always answers first, in real time).

* `rule_audit`  re-checks every chosen meal against the restrictions with the same word lists as the filters
                (defence in depth: a plan never leaves the server with a known violation).
* `gemini_review` asks Gemini whether any meal breaks the restrictions or pregnancy food safety in ways word
                lists miss (Caesar dressing has anchovy and raw egg, pesto has parmesan, naan has milk...) and for
                a short, personal summary of the day. Flagged meals are swapped by the caller.
* `gemini_plan` writes a day of meals when the optimiser cannot (very narrow restrictions): clearly marked as
                AI-written with approximate nutrients.
"""

from __future__ import annotations

import json
import re
from typing import Dict, List, Optional

from diet_rules import RESTRICTION_TERMS, compile_terms
from gemini_client import gemini_enabled, generate, strip_code_fences


def rule_audit(text: str, restrictions: List[str], aversions: List[str]) -> List[str]:
    """Restrictions/aversions the text (name + ingredients, lower-case) breaks."""
    broken = []
    for key in restrictions:
        terms = RESTRICTION_TERMS.get(key)
        if terms and re.search(compile_terms(terms), text):
            broken.append(key)
    for a in aversions:
        a = a.strip().lower()
        if a and re.search(compile_terms([a]), text):
            broken.append(f"avoids {a}")
    return broken


def _profile_line(info) -> str:
    bits = [f"month {info.pregnancy_month} of pregnancy"]
    if info.dietary_restrictions:
        bits.append("restrictions: " + ", ".join(info.dietary_restrictions))
    if info.food_aversions:
        bits.append("avoids: " + ", ".join(info.food_aversions))
    conditions = [n for n, on in [("gestational diabetes", info.has_gestational_diabetes), ("anaemia", info.has_anemia),
                                  ("heartburn", info.has_heartburn), ("constipation", info.has_constipation),
                                  ("morning sickness", info.has_morning_sickness)] if on]
    if conditions:
        bits.append("conditions: " + ", ".join(conditions))
    return "; ".join(bits)


def gemini_review(meals: List[Dict], info, context: List[str]) -> Optional[Dict]:
    """meals: [{id, slot, name, ingredients}]. Returns {"flags": {id: issue}, "summary": str} or None."""
    if not gemini_enabled() or not meals:
        return None
    listing = "\n".join(f'{m["id"]}. [{m["slot"]}] {m["name"]} — {", ".join(m["ingredients"][:25])}' for m in meals)
    prompt = (
        "You check a day's meal plan for a pregnant woman. Profile: " + _profile_line(info) + ".\n"
        + ("Context: " + " ".join(context) + "\n" if context else "")
        + "Meals (id, meal, name — ingredients):\n" + listing + "\n\n"
        "1) Flag a meal ONLY if it clearly breaks her restrictions or avoided foods (including hidden ones: anchovy in "
        "Worcestershire/Caesar, gelatin, parmesan in pesto, egg in mayonnaise, milk/ghee in naan or paneer, wheat in soy "
        "sauce for gluten-free), or is unsafe in pregnancy (alcohol, raw or undercooked eggs/meat/fish, unpasteurised "
        "cheese, liver, high-mercury fish). Do not flag for taste or mild concerns.\n"
        "2) Write a warm, plain summary in 2 sentences (max 60 words) of why this day suits her, naming 1-2 specific "
        "meals. No medical claims beyond general nutrition.\n"
        'Reply with JSON only: {"flags": [{"id": <id>, "issue": "<max 15 words>"}], "summary": "<text>"}'
    )
    text = generate([{"text": prompt}], temperature=0.1, max_output_tokens=500, json_mode=True, timeout_s=25)
    if not text:
        return None
    try:
        data = json.loads(strip_code_fences(text))
    except ValueError:
        return None
    ids = {m["id"] for m in meals}
    flags = {}
    for f in data.get("flags") or []:
        try:
            mid = int(f.get("id"))
        except (TypeError, ValueError, AttributeError):
            continue
        if mid in ids:
            flags[mid] = str(f.get("issue") or "Doesn't fit your restrictions")[:120]
    summary = str(data.get("summary") or "").strip()[:400] or None
    return {"flags": flags, "summary": summary}


def gemini_plan(info, targets, context: List[str]) -> Optional[List[Dict]]:
    """Five meals written by Gemini, used only when the optimiser finds no plan."""
    if not gemini_enabled():
        return None
    prompt = (
        "Write one day of home-style meals for a pregnant woman (" + _profile_line(info) + "). "
        + ("Context: " + " ".join(context) + " " if context else "")
        + f"Aim for about {round(targets.energy_kcal)} kcal and {round(targets.minimums['protein_g'])} g protein in total, "
        "with iron-, folate- and calcium-rich foods, little added sugar and salt. Follow her restrictions strictly and "
        "pregnancy food safety (no alcohol, raw egg/meat/fish, liver, unpasteurised cheese, high-mercury fish).\n"
        'Reply with JSON only: {"meals": [{"slot": "breakfast|snack_am|lunch|snack_pm|dinner", "name": "...", '
        '"ingredients": ["..."], "steps": ["... (max 5)"], "kcal": <number>, "protein_g": <number>}]} with exactly 5 meals.'
    )
    text = generate([{"text": prompt}], temperature=0.4, max_output_tokens=1800, json_mode=True, timeout_s=40)
    if not text:
        return None
    try:
        meals = json.loads(strip_code_fences(text)).get("meals") or []
    except ValueError:
        return None
    out = []
    for m in meals:
        slot = str(m.get("slot", ""))
        if slot not in {"breakfast", "snack_am", "lunch", "snack_pm", "dinner"} or not m.get("name"):
            continue
        ingredients = [str(x) for x in (m.get("ingredients") or [])][:25]
        text_all = (str(m["name"]) + " " + " ".join(ingredients)).lower()
        if rule_audit(text_all, info.dietary_restrictions, info.food_aversions):
            continue  # never pass on a meal that breaks a restriction, even from Gemini
        out.append({"slot": slot, "name": str(m["name"])[:120], "ingredients": ingredients,
                    "steps": [str(x) for x in (m.get("steps") or [])][:5],
                    "kcal": float(m.get("kcal") or 0), "protein_g": float(m.get("protein_g") or 0)})
    return out if len({m["slot"] for m in out}) >= 4 else None
