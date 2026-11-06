import base64
import json
import os
from typing import Any, Dict, Optional

from gemini_client import gemini_enabled, generate, strip_code_fences
from ocr.handwriting import transcript_for_llm


def _get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value


def _strip_code_fences(text: str) -> str:
    return strip_code_fences(text)


def _call_gemini_parts(parts: list[dict[str, Any]], *, timeout_s: int = 45) -> Optional[str]:
    return generate(
        parts,
        temperature=0.2,
        max_output_tokens=4096,
        json_mode=True,
        timeout_s=timeout_s,
        preferred_env="GEMINI_PRESCRIPTION_MODEL",
    )


def _inline_data_part(file_bytes: bytes, mime_type: str) -> dict[str, Any]:
    encoded = base64.b64encode(file_bytes).decode("utf-8")
    return {"inlineData": {"mimeType": mime_type, "data": encoded}}


def _extract_outer_json_object(text: str) -> Optional[str]:
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_str = False
    escaped = False
    for idx in range(start, len(text)):
        ch = text[idx]

        if escaped:
            escaped = False
            continue

        if ch == "\\":
            escaped = True
            continue

        if ch == '"':
            in_str = not in_str
            continue

        if in_str:
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:idx + 1]

    return None


def _parse_json_object_best_effort(text: str) -> Optional[Dict[str, Any]]:
    cleaned = _strip_code_fences(text)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except (ValueError, json.JSONDecodeError):
        pass

    json_slice = _extract_outer_json_object(cleaned)
    if json_slice:
        try:
            parsed = json.loads(json_slice)
            if isinstance(parsed, dict):
                return parsed
        except (ValueError, json.JSONDecodeError):
            pass

    return None


def extract_prescription_structured(
    *,
    file_bytes: bytes,
    mime_type: str,
    filename: str,
    ocr_result: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Extract a structured report from a prescription (PDF/photo).

    Returns a dict or None if Gemini is not configured/unavailable.

    Notes:
    - This is best-effort extraction; it may be incomplete.
    - The output is not medical advice.
    """

    if not gemini_enabled():
        return None

    # Block-letter OCR (ocr/handwriting.py) is only passed on when it read the page CLEARLY;
    # noisy guesses on cursive writing would mislead the model.
    ocr_text = transcript_for_llm(ocr_result)
    ocr_assist_prompt = ""
    if ocr_text:
        ocr_assist_prompt = (
            "\nOCR_ASSIST (local block-letter handwriting OCR, avg confidence "
            f"{ocr_result.get('avg_confidence', 0):.2f}):\n{ocr_text[:1200]}\n"
            "Use it only to disambiguate unclear characters. The attached document is the source of truth; "
            "report any conflict in uncertainties.\n"
        )

    prompt = (
        "You are a careful medical document transcription assistant. "
        "The user uploaded a prescription (may be handwritten) as PDF or image.\n"
        "TASK: Extract the readable information and return a structured JSON report.\n\n"
        "STRICT RULES:\n"
        "- Do NOT guess missing values. If unclear, set the field to null and add an item to uncertainties.\n"
        "- Do NOT provide diagnosis or treatment advice.\n"
        "- Keep units and dosages exactly as written.\n"
        "- Return JSON ONLY (no markdown, no explanations).\n\n"
        "- Keep response concise. Avoid long prose in list items.\n\n"
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
        + ocr_assist_prompt
    )

    parts = [{"text": prompt}, _inline_data_part(file_bytes, mime_type)]

    text = _call_gemini_parts(parts)

    if not text:
        return None

    parsed = _parse_json_object_best_effort(text)
    if parsed is not None:
        return parsed

    cleaned = _strip_code_fences(text)
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
        "uncertainties": ["Could not parse JSON. Raw text attached.", cleaned[:3000]],
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
        "- Keep each list item concise (one sentence).\n"
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

    parsed = _parse_json_object_best_effort(text)
    if parsed is not None:
        return parsed

    cleaned = _strip_code_fences(text)
    return {
        "title": "Diet Plan",
        "summary": cleaned,
        "do": [],
        "avoid": [],
        "meal_ideas": [],
        "questions_for_doctor": [],
        "safety_notes": [],
    }
