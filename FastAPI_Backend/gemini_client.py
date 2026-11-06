"""Shared Gemini REST client used by the refiner and the prescription reader.

- Sends the API key in the `x-goog-api-key` header (never in the URL, where proxies/logs record it).
- Tries the configured model first, then current defaults, then models discovered via ListModels,
  so a retired model name (e.g. gemini-1.5-flash) no longer silently disables every AI feature.
- Remembers the first model that works.
"""

import os
import threading
from functools import lru_cache
from typing import Any, Dict, List, Optional

import requests

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"]

_working_model: Optional[str] = None
_lock = threading.Lock()


def _env(name: str) -> Optional[str]:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else None


def gemini_enabled() -> bool:
    return bool(_env("GEMINI_API_KEY"))


@lru_cache(maxsize=1)
def _discovered_models() -> List[str]:
    """Flash models that support generateContent for this key (best-effort, cached)."""
    key = _env("GEMINI_API_KEY")
    if not key:
        return []
    try:
        res = requests.get(f"{API_ROOT}/models", headers={"x-goog-api-key": key}, timeout=10)
        if res.status_code >= 400:
            return []
        out = []
        for m in res.json().get("models", []):
            name = str(m.get("name", "")).removeprefix("models/")
            if "generateContent" in m.get("supportedGenerationMethods", []) and "flash" in name:
                out.append(name)
        return out
    except (requests.exceptions.RequestException, ValueError):
        return []


def _candidate_models(preferred_env: Optional[str]) -> List[str]:
    ordered = [
        _working_model,
        _env(preferred_env) if preferred_env else None,
        _env("GEMINI_MODEL"),
        *DEFAULT_MODELS,
    ]
    seen, out = set(), []
    for m in ordered:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _text_from_response(data: Dict[str, Any]) -> Optional[str]:
    candidates = data.get("candidates") or [{}]
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "\n".join(p.get("text", "") for p in parts if p.get("text"))
    return text.strip() or None


def generate(
    parts: List[Dict[str, Any]],
    *,
    temperature: float = 0.3,
    max_output_tokens: int = 1024,
    json_mode: bool = False,
    timeout_s: int = 30,
    preferred_env: Optional[str] = None,
) -> Optional[str]:
    """Call generateContent; returns the response text or None if Gemini is unavailable."""
    global _working_model
    key = _env("GEMINI_API_KEY")
    if not key:
        return None

    config: Dict[str, Any] = {"temperature": temperature, "maxOutputTokens": max_output_tokens}
    if json_mode:
        config["responseMimeType"] = "application/json"
    body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": config}
    headers = {"x-goog-api-key": key, "content-type": "application/json"}

    tried = set()
    for model_list in (_candidate_models(preferred_env), None):
        models = model_list if model_list is not None else _discovered_models()
        for model in models:
            if model in tried:
                continue
            tried.add(model)
            try:
                res = requests.post(
                    f"{API_ROOT}/models/{model}:generateContent", json=body, headers=headers, timeout=timeout_s
                )
            except requests.exceptions.RequestException:
                continue
            if res.status_code in (400, 401, 403):
                # Bad request / bad key: another model name will not help.
                if res.status_code != 400 or "model" not in res.text.lower():
                    return None
                continue
            if res.status_code >= 400:
                continue  # 404 retired model, 429 quota, 5xx: try the next model
            try:
                text = _text_from_response(res.json())
            except ValueError:
                continue
            if text:
                with _lock:
                    _working_model = model
                return text
    return None


def strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.lower().startswith("```json"):
        t = t[7:]
    if t.startswith("```"):
        t = t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return t.strip()
