"""Shared Gemini REST client used by the refiner and the prescription reader.

- Sends the API key in the `x-goog-api-key` header (never in the URL, where proxies/logs record it).
- Tries the configured model first, then current defaults, then models discovered via ListModels,
  so a retired model name (e.g. gemini-1.5-flash) no longer silently disables every AI feature.
- Remembers the first model that works.
- Falls back to the Interactions API (`POST /v1beta/interactions`). Newer keys (`AQ.` format, new accounts)
  get 404 on every generateContent model, while Interactions works.
"""

import os
import threading
from functools import lru_cache
from typing import Any, Dict, List, Optional

import requests

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"]
# Interactions API models, fastest first (gemini-3.1-flash-lite answers in ~6 s; newer flash models were
# often overloaded when tested). Override with GEMINI_INTERACTIONS_MODEL.
INTERACTIONS_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash"]

_working_model: Optional[str] = None
# None = not known yet; True = generateContent is closed for this key, so go straight to Interactions.
_use_interactions: Optional[bool] = None
_working_interactions_model: Optional[str] = None
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


def _interactions_input(parts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """generateContent parts -> Interactions input items (text, image, document)."""
    out: List[Dict[str, Any]] = []
    for p in parts:
        if p.get("text"):
            out.append({"type": "text", "text": p["text"]})
            continue
        inline = p.get("inlineData") or p.get("inline_data")
        if inline:
            mime = inline.get("mimeType") or inline.get("mime_type") or "application/octet-stream"
            kind = "image" if mime.startswith("image/") else "document"
            out.append({"type": kind, "mime_type": mime, "data": inline.get("data", "")})
    return out


def _text_from_interaction(data: Dict[str, Any]) -> Optional[str]:
    texts = [
        c.get("text", "")
        for step in data.get("steps") or []
        if step.get("type") == "model_output"
        for c in step.get("content") or []
        if c.get("type") == "text" and c.get("text")
    ]
    text = "\n".join(texts)
    return text.strip() or None


def _generate_with_interactions(
    key: str,
    parts: List[Dict[str, Any]],
    *,
    temperature: float,
    max_output_tokens: int,
    json_mode: bool,
    timeout_s: int,
) -> Optional[str]:
    global _working_interactions_model
    body: Dict[str, Any] = {
        "input": _interactions_input(parts),
        "store": False,  # don't keep patient data on Google's side
        # Hidden "thinking" tokens count against max_output_tokens and cut JSON answers off mid-way.
        "generation_config": {"temperature": temperature, "max_output_tokens": max_output_tokens, "thinking_level": "minimal"},
    }
    if json_mode:
        body["response_format"] = {"type": "text", "mime_type": "application/json"}
    headers = {"x-goog-api-key": key, "content-type": "application/json"}
    models = [_working_interactions_model, _env("GEMINI_INTERACTIONS_MODEL"), *INTERACTIONS_MODELS]
    seen = set()
    for model in models:
        if not model or model in seen:
            continue
        seen.add(model)
        try:
            res = requests.post(f"{API_ROOT}/interactions", json={**body, "model": model}, headers=headers, timeout=timeout_s)
        except requests.exceptions.RequestException:
            continue
        if res.status_code in (401, 403):
            return None
        if res.status_code >= 400:
            continue
        try:
            text = _text_from_interaction(res.json())
        except ValueError:
            continue
        if text:
            with _lock:
                _working_interactions_model = model
            return text
    return None


def generate(
    parts: List[Dict[str, Any]],
    *,
    temperature: float = 0.3,
    max_output_tokens: int = 1024,
    json_mode: bool = False,
    timeout_s: int = 30,
    preferred_env: Optional[str] = None,
) -> Optional[str]:
    """Call Gemini; returns the response text or None if Gemini is unavailable."""
    global _working_model, _use_interactions
    key = _env("GEMINI_API_KEY")
    if not key:
        return None
    via_interactions = dict(
        temperature=temperature, max_output_tokens=max_output_tokens, json_mode=json_mode, timeout_s=timeout_s
    )
    if _use_interactions:
        return _generate_with_interactions(key, parts, **via_interactions)

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
            if res.status_code == 404 and _use_interactions is None:
                # Either a retired model or generateContent closed for this (new) key: try Interactions once.
                text = _generate_with_interactions(key, parts, **via_interactions)
                if text:
                    with _lock:
                        _use_interactions = True
                    return text
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
