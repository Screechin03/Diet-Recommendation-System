import json
import os
from typing import Any, Dict, List, Optional

import requests
from requests import Response


def _get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value


def gemini_enabled() -> bool:
    return bool(_get_env("GEMINI_API_KEY"))


def _call_gemini(prompt: str, *, timeout_s: int = 20) -> Optional[str]:
    api_key = _get_env("GEMINI_API_KEY")
    if not api_key:
        return None

    model = _get_env("GEMINI_MODEL", "gemini-1.5-flash")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 512,
        },
    }

    try:
        res: Response = requests.post(url, json=body, timeout=timeout_s)
    except requests.exceptions.RequestException:
        return None
    if res.status_code >= 400:
        return None

    try:
        data = res.json()
    except ValueError:
        return None

    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "\n".join([p.get("text", "") for p in parts if p.get("text")])
    return text.strip() if text else None


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.lower().startswith("```json"):
        t = t[7:]
    if t.startswith("```"):
        t = t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()


def refine_recipe_tips(
    pregnancy_info: Dict[str, Any],
    ingredients: List[str],
    recipes: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Return a short, safe explanation + tips. Never modifies recipe numbers."""

    if not gemini_enabled():
        return None

    small_recipes = []
    for r in recipes[:5]:
        small_recipes.append(
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
        )

    payload = {
        "pregnancy_info": pregnancy_info,
        "ingredients": ingredients,
        "recipes": small_recipes,
    }

    prompt = (
        "You are a helpful assistant for a pregnancy nutrition app.\n"
        "RULES:\n"
        "- Do NOT invent facts or medical claims.\n"
        "- Do NOT change numeric nutrition values.\n"
        "- Only explain the given recipes and give practical, non-medical tips.\n"
        "- If safety is relevant, include: 'Consult your clinician for personalized advice.'\n"
        "OUTPUT FORMAT: Return JSON ONLY with keys: title, summary, tips.\n"
        "- title: short string\n"
        "- summary: 2-4 sentences\n"
        "- tips: 4-8 short strings\n"
        "\nINPUT JSON:\n"
        + json.dumps(payload)
    )

    text = _call_gemini(prompt)
    if not text:
        return None

    cleaned = _strip_code_fences(text)
    try:
        return json.loads(cleaned)
    except (ValueError, json.JSONDecodeError):
        return {"title": "Tips", "summary": cleaned, "tips": []}


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
        "OUTPUT FORMAT: Return JSON ONLY with keys: title, summary, next_steps.\n"
        "- title: short string\n"
        "- summary: 2-4 sentences\n"
        "- next_steps: 3-6 short strings\n"
        "\nINPUT JSON:\n"
        + json.dumps(payload)
    )

    text = _call_gemini(prompt)
    if not text:
        return None

    cleaned = _strip_code_fences(text)
    try:
        return json.loads(cleaned)
    except (ValueError, json.JSONDecodeError):
        return {"title": "Explanation", "summary": cleaned, "next_steps": []}
