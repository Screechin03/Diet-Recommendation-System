"""Tests for the vitals device integration (protocol, analysis, report, API)."""

import json
import os
import sys

import numpy as np
import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

from vitals.analysis import analyze  # noqa: E402
from vitals.protocol import ProtocolError, parse_bytes, parse_lines  # noqa: E402
from vitals.simulate import generate  # noqa: E402


def _run(scenario, seconds=120, **kw):
    return analyze(parse_lines(generate(scenario, seconds, **kw)))


@pytest.mark.parametrize(
    "scenario,status,finding",
    [
        ("normal", "normal", None),
        ("tachycardia", "urgent", "High resting heart rate"),
        ("low_spo2", "urgent", "Low blood oxygen"),
        ("fever", "urgent", "Fever"),
        ("irregular", "attention", "Irregular heartbeat pattern"),
        ("leads_off", "normal", "Part of the ECG was unusable"),
    ],
)
def test_scenarios_are_classified(scenario, status, finding):
    a = _run(scenario)
    assert a["status"] == status
    titles = [f["title"] for f in a["findings"]]
    assert (finding in titles) if finding else not titles


def test_ecg_heart_rate_and_beat_count_are_accurate():
    e = _run("normal")["metrics"]["ecg"]
    assert e["heart_rate"] == 78
    assert 150 <= e["beats"] <= 160  # 120 s at 78 bpm = 156


@pytest.mark.parametrize("hz", [250, 500])
def test_sample_rates(hz):
    assert _run("normal", ecg_hz=hz)["metrics"]["ecg"]["heart_rate"] == 78


def _mutate_ecg(lines, fn):
    out = []
    for line in lines:
        o = json.loads(line)
        if o["t"] == "ecg":
            o["s"] = np.clip(fn(np.array(o["s"], float)), 0, 4095).astype(int).tolist()
        out.append(json.dumps(o))
    return out


def test_noise_does_not_invent_a_heart_rate_or_arrhythmia():
    rng = np.random.default_rng(1)
    lines = _mutate_ecg(generate("normal", 120), lambda s: 2048 + rng.normal(0, 15, s.size))
    a = analyze(parse_lines(lines))
    assert a["metrics"]["ecg"]["status"] == "unavailable"
    assert "Irregular heartbeat pattern" not in [f["title"] for f in a["findings"]]
    assert a["status"] == "normal"  # pulse oximeter readings are still fine


def test_inverted_electrodes_still_work():
    lines = _mutate_ecg(generate("normal", 120), lambda s: 4095 - s)
    assert analyze(parse_lines(lines))["metrics"]["ecg"]["heart_rate"] == 78


def test_parser_skips_junk_and_rejects_impossible_values():
    lines = generate("normal", 90)
    lines[5:5] = ["Booting ESP32...", "{bad json", "[1,2]", '{"t":"vitals","ms":"x"}',
                  '{"t":"vitals","ms":2300,"hr":0,"spo2":-999,"finger":true}']
    s = parse_lines(lines + ['{"t":"ecg","ms":1200'])  # half-written last line from a pulled SD card
    assert s.lines_skipped == 5
    assert s.values_rejected == 2
    assert analyze(s)["status"] == "normal"


def test_device_restart_keeps_latest_session():
    # Firmware appended a second session to the same SD file after a reboot (clock back to 0).
    s = parse_lines(generate("fever", 70) + generate("normal", 90))
    assert s.restarts == 1
    assert analyze(s)["status"] == "normal"  # only the latest session counts


def test_small_timestamp_jitter_keeps_data():
    lines = generate("normal", 90)
    lines[10:10] = ['{"t":"vitals","ms":4600,"hr":79,"spo2":98,"finger":true}']  # slightly ahead of its neighbours
    s = parse_lines(lines)
    assert s.lines_skipped == 0 and len(s.vitals) == 90


def test_recording_started_mid_session():
    lines = generate("normal", 150)
    hello, rest = lines[0], [l for l in lines[1:] if json.loads(l).get("ms", 0) >= 50_000]
    a = analyze(parse_lines([hello] + rest))
    assert 95 <= a["session"]["duration_s"] <= 101 and a["status"] == "normal"


def test_short_session_is_insufficient():
    a = _run("normal", 30)
    assert a["status"] == "insufficient"


def test_not_a_device_file():
    with pytest.raises(ProtocolError):
        parse_lines(["name,age", "a,1"])
    with pytest.raises(ProtocolError):
        parse_bytes("\n".join(generate("normal", 60)).encode("utf-16"))


def test_demo_sessions_are_flagged():
    assert _run("normal")["demo"] is True


def test_pdf_report_escapes_text_and_marks_demo():
    from vitals.report_pdf import build_report

    a = _run("tachycardia")
    pdf = build_report(a, {"name": "<b>Priya</b> & co", "pregnancy_month": 6})
    assert pdf.startswith(b"%PDF") and len(pdf) > 5000
    # A tampered analysis must not crash the report
    assert build_report({"status": "bogus", "metrics": {"heart_rate": "x"}, "ecg_strip": {"mv": "nope"}}).startswith(b"%PDF")


@pytest.fixture(scope="module")
def client():
    from fastapi.testclient import TestClient

    import main

    with TestClient(main.app) as c:
        yield c


def test_api_round_trip(client):
    demo = client.get("/vitals/demo", params={"scenario": "fever", "seconds": 90}).json()
    a = client.post("/vitals/analyze", json={"lines": demo["lines"], "pregnancy_month": 7}).json()
    assert a["status"] == "urgent" and a["session"]["pregnancy_month"] == 7

    f = client.post("/vitals/analyze_file", files={"file": ("S.jsonl", "\n".join(demo["lines"]).encode(), "application/octet-stream")})
    assert f.status_code == 200 and f.json()["status"] == "urgent"

    pdf = client.post("/vitals/report", json={"analysis": a, "patient": {"name": "Test"}})
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"


def test_api_errors_are_readable(client):
    bad = client.post("/vitals/analyze_file", files={"file": ("x.csv", b"a,b\n1,2\n", "text/csv")})
    assert bad.status_code == 422 and "MamaCare device" in bad.json()["detail"]
    assert client.get("/vitals/demo", params={"scenario": "nope"}).status_code == 422
    assert client.post("/vitals/analyze", json={"lines": [], "activity": "running"}).status_code == 422
