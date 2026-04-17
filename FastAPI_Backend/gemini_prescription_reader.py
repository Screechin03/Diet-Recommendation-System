import base64
import json
import os
from typing import Any, Dict, Optional

import requests
from requests import Response


def _get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value


def gemini_enabled() -> bool:
    return bool(_get_env("GEMINI_API_KEY"))


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.lower().startswith("```json"):
        t = t[7:]
    if t.startswith("```"):
        t = t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()


def _call_gemini_parts(parts: list[dict[str, Any]], *, timeout_s: int = 45) -> Optional[str]:
    api_key = _get_env("GEMINI_API_KEY")
    if not api_key:
        return None

    model = (
        _get_env("GEMINI_PRESCRIPTION_MODEL")
        or _get_env("GEMINI_MODEL")
        or "gemini-1.5-flash"
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1536,
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

    candidate_parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "\n".join([p.get("text", "") for p in candidate_parts if p.get("text")])
    return text.strip() if text else None


def _inline_data_part(file_bytes: bytes, mime_type: str) -> dict[str, Any]:
    encoded = base64.b64encode(file_bytes).decode("utf-8")
    return {"inlineData": {"mimeType": mime_type, "data": encoded}}


def extract_prescription_structured(
    *,
    file_bytes: bytes,
    mime_type: str,
    filename: str,
) -> Optional[Dict[str, Any]]:
    """Extract a structured report from a prescription (PDF/photo).

    Returns a dict or None if Gemini is not configured/unavailable.

    Notes:
    - This is best-effort extraction; it may be incomplete.
    - The output is not medical advice.
    """

    if not gemini_enabled():
        return None

    prompt = (
        "You are a careful medical document transcription assistant. "
        "The user uploaded a prescription (may be handwritten) as PDF or image.\n"
        "TASK: Extract the readable information and return a structured JSON report.\n\n"
        "STRICT RULES:\n"
        "- Do NOT guess missing values. If unclear, set the field to null and add an item to uncertainties.\n"
        "- Do NOT provide diagnosis or treatment advice.\n"
        "- Keep units and dosages exactly as written.\n"
        "- Return JSON ONLY (no markdown, no explanations).\n\n"
        "OUTPUT JSON SCHEMA (keys must exist):\n"
        "{\n"
        "  \"patient\": {\"name\": string|null, \"age\": string|null, \"sex\": string|null},\n"
        "  \"document\": {\"type\": \"prescription\"|\"lab_report\"|\"discharge_summary\"|null, \"date\": string|null, \"provider\": string|null},\n"
        "  \"diagnoses\": [string],\n"
        "  \"medications\": [\n"
        "    {\"name\": string|null, \"dose\": string|null, \"frequency\": string|null, \"duration\": string|null, \"notes\": string|null}\n"
        "  ],\n"
        "  \"tests\": [\n"
        "    {\"name\": string|null, \"value\": string|null, \"unit\": string|null, \"reference_range\": string|null, \"flag\": string|null}\n"
        "  ],\n"
        "  \"instructions\": [string],\n"
        "  \"dietary_notes\": [string],\n"
        "  \"follow_up\": [string],\n"
        "  \"allergies\": [string],\n"
        "  \"uncertainties\": [string]\n"
        "}\n\n"
        f"FILENAME: {filename}\n"
        f"MIME_TYPE: {mime_type}\n"
    )

    text = _call_gemini_parts(
        [
            {"text": prompt},
            _inline_data_part(file_bytes, mime_type),
        ]
    )

    if not text:
        return None

    cleaned = _strip_code_fences(text)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
        return {"uncertainties": ["Model returned non-object JSON."]}
    except (ValueError, json.JSONDecodeError):
        # Fallback: return best-effort text.
        return {
            "patient": {"name": None, "age": None, "sex": None},
            "document": {"type": None, "date": None, "provider": None},
            "diagnoses": [],
            "medications": [],
            "tests": [],
            "instructions": [],
            "dietary_notes": [],
            "follow_up": [],
            "allergies": [],
            "uncertainties": ["Could not parse JSON. Raw text attached.", cleaned[:2000]],
        }


def generate_diet_plan_from_extraction(
    *,
    extracted: Dict[str, Any],
    dietary_preferences: list[str],
    allergies: list[str],
    goals: list[str],
) -> Optional[Dict[str, Any]]:
    """Generate general diet guidance based on extracted prescription content.

    This intentionally stays high-level and conservative.
    """

    if not gemini_enabled():
        return None

    payload = {
        "extracted": extracted,
        "user_preferences": {
            "dietary_preferences": dietary_preferences,
            "allergies": allergies,
            "goals": goals,
        },
    }

    prompt = (
        "You are a careful diet-planning assistant. You are given extracted prescription data.\n"
        "RULES:\n"
        "- Do NOT diagnose and do NOT change/interpret dosages.\n"
        "- Do NOT contradict the document; if unsure, say it's uncertain.\n"
        "- Provide general nutrition guidance and meal ideas only.\n"
        "- Include: 'This is not medical advice. Follow your clinician\'s instructions.'\n"
        "- Return JSON ONLY.\n\n"
        "OUTPUT JSON KEYS (must exist):\n"
        "{\n"
        "  \"title\": string,\n"
        "  \"summary\": string,\n"
        "  \"do\": [string],\n"
        "  \"avoid\": [string],\n"
        "  \"meal_ideas\": [string],\n"
        "  \"questions_for_doctor\": [string],\n"
        "  \"safety_notes\": [string]\n"
        "}\n\n"
        "INPUT JSON:\n"
        + json.dumps(payload)
    )

    text = _call_gemini_parts([{"text": prompt}])
    if not text:
        return None

    cleaned = _strip_code_fences(text)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
        return {"title": "Diet Plan", "summary": cleaned, "do": [], "avoid": [], "meal_ideas": [], "questions_for_doctor": [], "safety_notes": []}
    except (ValueError, json.JSONDecodeError):
        return {"title": "Diet Plan", "summary": cleaned, "do": [], "avoid": [], "meal_ideas": [], "questions_for_doctor": [], "safety_notes": []}
