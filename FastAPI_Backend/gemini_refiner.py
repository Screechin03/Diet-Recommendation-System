import json
from typing import Any, Dict, List, Optional

from gemini_client import gemini_enabled, generate, strip_code_fences


def _call_gemini(prompt: str, *, timeout_s: int = 20) -> Optional[str]:
    return generate([{"text": prompt}], temperature=0.3, max_output_tokens=768, json_mode=True, timeout_s=timeout_s)


def _object_from_list(items: List[Any], list_key: str, fallback_title: str) -> Optional[Dict[str, Any]]:
    """Lighter models sometimes answer with an array (the object wrapped in a list, or one entry per recipe)."""
    dicts = [x for x in items if isinstance(x, dict)]
    if len(dicts) == 1 and list_key in dicts[0]:
        return dicts[0]
    bullets = []
    for x in items:
        if isinstance(x, str) and x.strip():
            bullets.append(x.strip())
        elif isinstance(x, dict):
            head = str(x.get("title") or x.get("name") or x.get("Name") or "").strip()
            body = str(x.get("summary") or x.get("tip") or x.get("text") or "").strip()
            line = f"{head}: {body}" if head and body else head or body
            if line:
                bullets.append(line)
    return {"title": fallback_title, "summary": "", list_key: bullets} if bullets else None


def _parse(text: str, list_key: str, fallback_title: str) -> Dict[str, Any]:
    cleaned = strip_code_fences(text)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            parsed = _object_from_list(parsed, list_key, fallback_title)
        if not isinstance(parsed, dict):
            raise ValueError("not an object")
    except (ValueError, json.JSONDecodeError):
        parsed = {"title": fallback_title, "summary": cleaned, list_key: []}
    # Frontends render `bullets`; keep the original key too for backward compatibility.
    items = parsed.get(list_key)
    parsed["bullets"] = items if isinstance(items, list) else []
    return parsed


def refine_recipe_tips(
    pregnancy_info: Dict[str, Any],
    ingredients: List[str],
    recipes: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Return a short, safe explanation + tips. Never modifies recipe numbers."""

    if not gemini_enabled():
        return None

    small_recipes = [
        {
            "Name": r.get("Name"),
            "Calories": r.get("Calories"),
            "ProteinContent": r.get("ProteinContent"),
            "CarbohydrateContent": r.get("CarbohydrateContent"),
            "FatContent": r.get("FatContent"),
            "FiberContent": r.get("FiberContent"),
            "pregnancy_benefits": r.get("pregnancy_benefits", []),
            "RecipeIngredientParts": (r.get("RecipeIngredientParts") or [])[:12],
        }
        for r in recipes[:5]
    ]

    payload = {"pregnancy_info": pregnancy_info, "ingredients": ingredients, "recipes": small_recipes}

    prompt = (
        "You are a helpful assistant for a pregnancy nutrition app.\n"
        "RULES:\n"
        "- Do NOT invent facts or medical claims.\n"
        "- Do NOT change numeric nutrition values.\n"
        "- Only explain the given recipes and give practical, non-medical tips.\n"
        "- If safety is relevant, include: 'Consult your clinician for personalized advice.'\n"
        "OUTPUT FORMAT: Return ONE JSON object (not an array) with exactly the keys: title, summary, tips.\n"
        "- title: short string\n"
        "- summary: 2-4 sentences\n"
        "- tips: 4-8 short strings\n"
        "\nINPUT JSON:\n" + json.dumps(payload)
    )

    text = _call_gemini(prompt)
    return _parse(text, "tips", "Tips") if text else None


def refine_risk_explanation(
    health_data: Dict[str, Any],
    risk_response: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Return a plain-language explanation of the model output."""

    if not gemini_enabled():
        return None

    payload = {"health_data": health_data, "risk_response": risk_response}

    prompt = (
        "You are a careful assistant for a pregnancy health analytics app.\n"
        "RULES:\n"
        "- Do NOT diagnose.\n"
        "- Do NOT invent measurements.\n"
        "- Explain the provided risk output in plain language and suggest safe next-step questions.\n"
        "- Include: 'This is not medical advice. Consult a clinician.'\n"
        "OUTPUT FORMAT: Return ONE JSON object (not an array) with exactly the keys: title, summary, next_steps.\n"
        "- title: short string\n"
        "- summary: 2-4 sentences\n"
        "- next_steps: 3-6 short strings\n"
        "\nINPUT JSON:\n" + json.dumps(payload)
    )

    text = _call_gemini(prompt)
    return _parse(text, "next_steps", "Explanation") if text else None
