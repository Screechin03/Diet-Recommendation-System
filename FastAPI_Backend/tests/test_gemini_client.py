"""Gemini client: Interactions API fallback for keys where generateContent is closed (offline, no real calls)."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import gemini_client  # noqa: E402
import gemini_refiner  # noqa: E402


class _Res:
    def __init__(self, status, body=None):
        self.status_code = status
        self._body = body
        self.text = json.dumps(body) if body is not None else ""

    def json(self):
        if self._body is None:
            raise ValueError("no body")
        return self._body


def _interaction(text):
    return {"status": "completed", "steps": [{"type": "thought"}, {"type": "model_output", "content": [{"type": "text", "text": text}]}]}


@pytest.fixture()
def calls(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "AQ.test")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.delenv("GEMINI_INTERACTIONS_MODEL", raising=False)
    monkeypatch.setattr(gemini_client, "_working_model", None)
    monkeypatch.setattr(gemini_client, "_use_interactions", None)
    monkeypatch.setattr(gemini_client, "_working_interactions_model", None)
    gemini_client._discovered_models.cache_clear()
    made = []

    def fake_post(url, json=None, headers=None, timeout=None):
        made.append((url, json))
        if url.endswith(":generateContent"):
            return _Res(404)  # new-account key: every generateContent model is closed
        if json["model"] == gemini_client.INTERACTIONS_MODELS[0]:
            return _Res(503, {"error": {"code": 503}})  # first model overloaded
        return _Res(200, _interaction('{"ok": true}'))

    monkeypatch.setattr(gemini_client.requests, "post", fake_post)
    monkeypatch.setattr(gemini_client.requests, "get", lambda *a, **k: _Res(200, {"models": []}))
    yield made
    gemini_client._discovered_models.cache_clear()


def test_falls_back_to_interactions_and_remembers(calls):
    parts = [{"text": "hi"}, {"inlineData": {"mimeType": "image/png", "data": "AAA"}}, {"inline_data": {"mime_type": "application/pdf", "data": "BBB"}}]
    assert gemini_client.generate(parts, json_mode=True, temperature=0.2, max_output_tokens=99) == '{"ok": true}'

    url, body = calls[-1]
    assert url.endswith("/v1beta/interactions") and body["model"] == gemini_client.INTERACTIONS_MODELS[1]
    assert body["input"] == [
        {"type": "text", "text": "hi"},
        {"type": "image", "mime_type": "image/png", "data": "AAA"},
        {"type": "document", "mime_type": "application/pdf", "data": "BBB"},
    ]
    assert body["generation_config"] == {"temperature": 0.2, "max_output_tokens": 99, "thinking_level": "minimal"}
    assert body["response_format"]["mime_type"] == "application/json" and body["store"] is False

    calls.clear()
    assert gemini_client.generate([{"text": "again"}]) == '{"ok": true}'
    assert len(calls) == 1 and calls[0][0].endswith("/interactions")  # straight to the model that worked
    assert "response_format" not in calls[0][1]


def test_bad_key_stops_immediately(calls, monkeypatch):
    monkeypatch.setattr(gemini_client.requests, "post", lambda *a, **k: (calls.append(a), _Res(403, {}))[1])
    assert gemini_client.generate([{"text": "hi"}]) is None
    assert len(calls) == 1


@pytest.mark.parametrize(
    "text, expected_tips",
    [
        ('[{"title": "T", "summary": "S", "tips": ["a", "b"]}]', ["a", "b"]),
        ('[{"title": "Spaghetti", "summary": "Hearty."}, {"title": "Soup", "summary": "Light."}]', ["Spaghetti: Hearty.", "Soup: Light."]),
        ('{"title": "T", "summary": "S", "tips": ["x"]}', ["x"]),
    ],
)
def test_refiner_accepts_array_answers(text, expected_tips):
    parsed = gemini_refiner._parse(text, "tips", "Tips")
    assert parsed["tips"] == expected_tips and parsed["bullets"] == expected_tips
    assert isinstance(parsed["summary"], str)
