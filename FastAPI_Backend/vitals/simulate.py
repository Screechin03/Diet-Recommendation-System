"""Synthetic device sessions in protocol v1, for tests, demos and firmware comparison.

    python -m vitals.simulate --scenario normal --seconds 120 > session.jsonl

The ECG is a sum of Gaussian P, QRS and T waves per beat (a standard synthetic model),
plus baseline wander and noise, scaled like a 12-bit AD8232 reading centred at mid-scale.
"""

import argparse
import json
import sys
from typing import List

import numpy as np

SCENARIOS = ("normal", "tachycardia", "low_spo2", "fever", "irregular", "leads_off")

# (offset from R peak in s, width in s, amplitude in ADC counts)
_WAVES = [(-0.20, 0.025, 15), (-0.03, 0.010, -20), (0.0, 0.012, 160), (0.03, 0.010, -35), (0.25, 0.045, 35)]


def _beat_times(seconds: float, mean_hr: float, irregular: bool, rng: np.random.Generator) -> np.ndarray:
    t, beats = 0.3, []
    while t < seconds:
        beats.append(t)
        rr = 60.0 / mean_hr
        if irregular:
            rr *= rng.uniform(0.6, 1.4)  # irregularly irregular
        else:
            rr *= 1 + 0.03 * np.sin(2 * np.pi * t / 4.5) + rng.normal(0, 0.01)  # respiratory variation
        t += rr
    return np.array(beats)


def _ecg(seconds: float, hz: int, beats: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(int(seconds * hz)) / hz
    sig = np.full_like(t, 2048.0)
    for b in beats:
        lo, hi = np.searchsorted(t, [b - 0.4, b + 0.5])
        seg = t[lo:hi]
        for off, width, amp in _WAVES:
            sig[lo:hi] += amp * np.exp(-((seg - b - off) ** 2) / (2 * width**2))
    sig += 12 * np.sin(2 * np.pi * 0.25 * t)  # baseline wander (breathing)
    sig += rng.normal(0, 2.5, t.size)
    return np.clip(np.round(sig), 0, 4095)


def generate(scenario: str = "normal", seconds: int = 120, ecg_hz: int = 250, seed: int = 7) -> List[str]:
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario {scenario!r}; choose from {', '.join(SCENARIOS)}")
    rng = np.random.default_rng(seed)
    hr = {"tachycardia": 128.0}.get(scenario, 78.0)
    spo2 = {"low_spo2": 91.0}.get(scenario, 98.0)
    temp = {"fever": 38.4}.get(scenario, 36.8)

    beats = _beat_times(seconds, hr, scenario == "irregular", rng)
    ecg = _ecg(seconds, ecg_hz, beats, rng)
    chunk = ecg_hz // 2  # 0.5 s per line

    lines = [json.dumps({"t": "hello", "v": 1, "device": "simulator", "fw": f"sim-{scenario}", "ecg_hz": ecg_hz, "adc_bits": 12})]
    for start in range(0, ecg.size, chunk):
        ms = int(start * 1000 / ecg_hz)
        lo = scenario == "leads_off" and 20_000 <= ms < 80_000
        samples = ecg[start:start + chunk]
        if lo:
            samples = np.clip(4095 - rng.normal(0, 3, samples.size), 0, 4095).round()  # rails when an electrode is off
        lines.append(json.dumps({"t": "ecg", "ms": ms, "lo": bool(lo), "s": samples.astype(int).tolist()}))
        if ms % 1000 == 0 and ms > 0:
            second = ms // 1000
            finger = second > 3  # sensor settles for a few seconds
            hr_now = 60.0 / np.median(np.diff(beats[(beats > second - 8) & (beats <= second)])) if second > 8 else hr
            lines.append(json.dumps({
                "t": "vitals",
                "ms": ms,
                "hr": round(float(hr_now + rng.normal(0, 1.2))) if finger else None,
                "spo2": round(float(min(100, spo2 + rng.normal(0, 0.5)))) if finger else None,
                "temp_c": round(float(temp + rng.normal(0, 0.05)), 1),
                "finger": finger,
            }))
    lines.append(json.dumps({"t": "end", "ms": int(seconds * 1000)}))
    return lines


def main() -> None:
    ap = argparse.ArgumentParser(description="Write a synthetic MamaCare device session (protocol v1) to stdout.")
    ap.add_argument("--scenario", default="normal", choices=SCENARIOS)
    ap.add_argument("--seconds", type=int, default=120)
    ap.add_argument("--hz", type=int, default=250)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    sys.stdout.write("\n".join(generate(args.scenario, args.seconds, args.hz, args.seed)) + "\n")


if __name__ == "__main__":
    main()
