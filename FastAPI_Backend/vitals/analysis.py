"""Analysis of a vitals session: sustained thresholds, ECG beat detection, HRV, quality checks.

Thresholds are conservative screening values for pregnant adults at rest, not diagnoses:
  heart rate 60-100 bpm (rises 10-20 bpm in pregnancy; >100 sustained = review, >120 = same day)
  SpO2 >= 95 % (92-94 = review, < 92 = same day)
  temperature 36.1-37.4 C (37.5-37.9 = review, >= 38.0 = fever, same day)
Every flag needs the value to persist (rolling median), so a single motion artefact never raises an alert.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from scipy.signal import butter, filtfilt, find_peaks

from .protocol import Session

ANALYSIS_VERSION = "1.0"
MIN_SESSION_S = 60
MIN_SAMPLES = 30  # seconds of valid readings needed for a metric
SEVERITY_RANK = {"info": 0, "attention": 1, "urgent": 2}
DISCLAIMER = (
    "This report is generated from a home monitoring device and is not a medical diagnosis. "
    "It does not replace your doctor or midwife. If you feel unwell, have chest pain, trouble breathing, "
    "bleeding, severe headache or reduced baby movements, seek care immediately."
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _finding(severity: str, title: str, detail: str, metric: str) -> Dict[str, str]:
    return {"severity": severity, "title": title, "detail": detail, "metric": metric}


def _rolling_median(times: np.ndarray, values: np.ndarray, window_s: float, min_points: int) -> np.ndarray:
    out = np.full(values.size, np.nan)
    lo = 0
    for i, t in enumerate(times):
        while times[lo] < t - window_s:
            lo += 1
        if i - lo + 1 >= min_points:
            out[i] = np.median(values[lo:i + 1])
    return out


def _downsample(times: np.ndarray, values: np.ndarray, max_points: int = 600) -> List[List[float]]:
    if times.size == 0:
        return []
    if times.size <= max_points:
        return [[round(float(t), 1), round(float(v), 1)] for t, v in zip(times, values)]
    edges = np.linspace(times[0], times[-1] + 1e-9, max_points + 1)
    idx = np.digitize(times, edges) - 1
    out = []
    for b in range(max_points):
        m = idx == b
        if m.any():
            out.append([round(float(times[m].mean()), 1), round(float(values[m].mean()), 1)])
    return out


def _round(v: Optional[float], nd: int = 1):
    if v is None or not np.isfinite(v):
        return None
    return int(round(float(v))) if nd == 0 else round(float(v), nd)


def _worst(*statuses: str) -> str:
    order = {"normal": 0, "attention": 1, "urgent": 2}
    return max(statuses, key=lambda st: order.get(st, 0))


def _rate_status(bpm: float, activity: str) -> str:
    if activity == "exercise":
        return "attention" if bpm > 160 else "normal"
    if bpm > 120:
        return "urgent"
    if bpm > 100 or bpm < 50:
        return "attention"
    return "normal"


# ---------------------------------------------------------------------------
# pulse oximeter + temperature
# ---------------------------------------------------------------------------

def _series(session: Session, attr: str) -> Tuple[np.ndarray, np.ndarray]:
    pts = [(v.ms / 1000.0, getattr(v, attr)) for v in session.vitals if getattr(v, attr) is not None]
    if not pts:
        return np.array([]), np.array([])
    t, x = zip(*pts)
    return np.asarray(t, float), np.asarray(x, float)


def _heart_rate(session: Session, activity: str, findings: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    t, hr = _series(session, "hr")
    if hr.size < MIN_SAMPLES:
        return None
    roll = _rolling_median(t, hr, 60, 30)
    sustained_hi = float(np.nanmax(roll)) if np.isfinite(roll).any() else float(np.median(hr))
    sustained_lo = float(np.nanmin(roll)) if np.isfinite(roll).any() else float(np.median(hr))
    status = "normal"
    if activity == "exercise":
        if sustained_hi > 160:
            status = "attention"
            findings.append(_finding("attention", "Very high heart rate during exercise",
                f"Your heart rate stayed around {sustained_hi:.0f} bpm. Slow down to a pace where you can still talk, "
                "and mention it at your next appointment.", "heart_rate"))
    else:
        if sustained_hi > 120:
            status = "urgent"
            findings.append(_finding("urgent", "High resting heart rate",
                f"Your heart rate stayed around {sustained_hi:.0f} bpm for over a minute while resting. "
                "Contact your doctor or midwife today.", "heart_rate"))
        elif sustained_hi > 100:
            status = "attention"
            findings.append(_finding("attention", "Raised resting heart rate",
                f"Your heart rate stayed around {sustained_hi:.0f} bpm while resting. Pregnancy raises heart rate a little, "
                "but over 100 bpm is worth checking. Rest for 10 minutes and measure again; if it stays high, tell your doctor.",
                "heart_rate"))
        if sustained_lo < 50:
            status = "attention" if status == "normal" else status
            findings.append(_finding("attention", "Low heart rate",
                f"Your heart rate dropped to around {sustained_lo:.0f} bpm. If you feel dizzy or faint, contact your doctor.",
                "heart_rate"))
    return {
        "avg": _round(hr.mean(), 0), "min": _round(hr.min(), 0), "max": _round(hr.max(), 0),
        "sustained_max": _round(sustained_hi, 0), "unit": "bpm", "normal_range": "60–100",
        "status": status, "samples": int(hr.size),
    }


def _spo2(session: Session, findings: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    t, s = _series(session, "spo2")
    if s.size < MIN_SAMPLES:
        return None
    roll = _rolling_median(t, s, 30, 20)
    sustained_lo = float(np.nanmin(roll)) if np.isfinite(roll).any() else float(np.median(s))
    status = "normal"
    if sustained_lo < 92:
        status = "urgent"
        findings.append(_finding("urgent", "Low blood oxygen",
            f"Your oxygen level stayed around {sustained_lo:.0f}% (normal is 95% or more). Re-check with a warm, still hand. "
            "If it is still below 92%, contact your doctor or midwife today; seek urgent care if you are short of breath.",
            "spo2"))
    elif sustained_lo < 95:
        status = "attention"
        findings.append(_finding("attention", "Slightly low blood oxygen",
            f"Your oxygen level stayed around {sustained_lo:.0f}% (normal is 95% or more). Cold fingers, nail polish "
            "or movement can lower the reading; measure again at rest and tell your doctor if it stays below 95%.",
            "spo2"))
    return {
        "avg": _round(s.mean(), 0), "min": _round(s.min(), 0), "sustained_min": _round(sustained_lo, 0),
        "time_below_95_pct": _round(100.0 * float((s < 95).mean()), 0),
        "unit": "%", "normal_range": "95–100", "status": status, "samples": int(s.size),
    }


def _temperature(session: Session, findings: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    t, c = _series(session, "temp_c")
    if c.size < 10:
        return None
    roll = _rolling_median(t, c, 60, 10)
    sustained_hi = float(np.nanmax(roll)) if np.isfinite(roll).any() else float(np.median(c))
    status = "normal"
    if sustained_hi >= 38.0:
        status = "urgent"
        findings.append(_finding("urgent", "Fever",
            f"Your temperature stayed around {sustained_hi:.1f} °C. A fever in pregnancy should be checked: "
            "contact your doctor or midwife today.", "temperature"))
    elif sustained_hi >= 37.5:
        status = "attention"
        findings.append(_finding("attention", "Slightly raised temperature",
            f"Your temperature was around {sustained_hi:.1f} °C. Rest, drink water and measure again in an hour.",
            "temperature"))
    elif np.median(c) < 35.0:
        status = "unavailable"
        findings.append(_finding("info", "Temperature reading looks too low",
            "The sensor may not be touching your skin properly. Check its position and measure again.", "temperature"))
    return {
        "avg": _round(c.mean(), 1), "max": _round(c.max(), 1), "sustained_max": _round(sustained_hi, 1),
        "unit": "°C", "normal_range": "36.1–37.4", "status": status, "samples": int(c.size),
    }


# ---------------------------------------------------------------------------
# ECG
# ---------------------------------------------------------------------------

def _bandpass(x: np.ndarray, fs: int, lo: float, hi: float) -> np.ndarray:
    b, a = butter(2, [lo / (fs / 2), min(hi / (fs / 2), 0.99)], btype="band")
    return filtfilt(b, a, x)


def _ecg_segments(session: Session) -> Tuple[List[Tuple[float, np.ndarray]], float, float]:
    """Contiguous runs of clean chunks. Returns (segments as (start_s, samples)), total seconds, usable seconds."""
    fs, hi = session.ecg_hz, 2 ** session.adc_bits - 1
    segments: List[Tuple[float, List[float]]] = []
    total_s = usable_s = 0.0
    cur_start, cur, expected_ms = None, [], None
    for ch in session.ecg:
        n = len(ch.samples)
        dur_ms = n * 1000.0 / fs
        total_s += dur_ms / 1000.0
        arr = np.asarray(ch.samples, float)
        bad = np.isnan(arr).mean() > 0.1 or (np.nanmean((arr <= hi * 0.01) | (arr >= hi * 0.99)) > 0.2)
        contiguous = expected_ms is not None and abs(ch.ms - expected_ms) <= max(50.0, 0.6 * dur_ms)
        if ch.lo or bad:
            if cur:
                segments.append((cur_start, cur))
            cur_start, cur, expected_ms = None, [], None
            continue
        if not contiguous and cur:
            segments.append((cur_start, cur))
            cur = []
        if not cur:
            cur_start = ch.ms / 1000.0
        cur.extend(ch.samples)
        expected_ms = ch.ms + dur_ms
        usable_s += dur_ms / 1000.0
    if cur:
        segments.append((cur_start, cur))
    out = []
    for start, samples in segments:
        x = np.asarray(samples, float)
        if np.isnan(x).any():
            idx = np.arange(x.size)
            ok = ~np.isnan(x)
            x = np.interp(idx, idx[ok], x[ok])
        out.append((start, x))
    return out, total_s, usable_s


def detect_r_peaks(x: np.ndarray, fs: int) -> np.ndarray:
    """Simplified Pan-Tompkins: band-pass, derivative, square, moving-window integration, adaptive threshold."""
    bp = _bandpass(x, fs, 5, 15)
    energy = np.gradient(bp) ** 2
    win = max(1, int(0.15 * fs))
    mwi = np.convolve(energy, np.ones(win) / win, mode="same")
    thr = 0.3 * np.percentile(mwi, 98)
    cand, _ = find_peaks(mwi, height=thr, distance=int(0.27 * fs))
    display = _bandpass(x, fs, 0.5, 40)
    centred = np.abs(display - np.median(display))
    peaks = []
    for p in cand:
        lo, hi = max(0, p - win), min(x.size, p + win)
        r = lo + int(np.argmax(centred[lo:hi]))
        if not peaks or r - peaks[-1] > int(0.25 * fs):
            peaks.append(r)
    return np.asarray(peaks, int)


def beat_consistency(x: np.ndarray, fs: int, peaks: np.ndarray) -> float:
    """Signal-quality index: median correlation of each beat with the average beat (0-1).

    Real heartbeats share one shape, so they correlate highly (> 0.9 on clean signals); peaks picked out of noise
    don't. This stops the detector from inventing a heart rate, or an "irregular rhythm", from a noisy trace.
    """
    display = _bandpass(x, fs, 0.5, 40)
    before, after = int(0.10 * fs), int(0.15 * fs)
    windows = np.array([display[p - before:p + after] for p in peaks if p - before >= 0 and p + after <= x.size])
    if len(windows) < 5:
        return 0.0
    template = np.median(windows, axis=0)
    t = template - template.mean()
    w = windows - windows.mean(axis=1, keepdims=True)
    denom = np.linalg.norm(w, axis=1) * np.linalg.norm(t)
    corr = (w @ t) / np.where(denom == 0, np.inf, denom)
    return float(np.median(corr))


MIN_BEAT_CONSISTENCY = 0.7


def _ecg(session: Session, activity: str, findings: List[Dict[str, str]]) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], float]:
    fs = session.ecg_hz
    segments, total_s, usable_s = _ecg_segments(session)
    if total_s == 0:
        return None, None, 0.0
    usable_pct = 100.0 * usable_s / total_s
    rr_all: List[np.ndarray] = []
    beats = 0
    best = None  # (score, start_s, display, peaks)
    for start, x in segments:
        if x.size < 8 * fs:
            continue
        peaks = detect_r_peaks(x, fs)
        if peaks.size < 5:
            continue
        if beat_consistency(x, fs, peaks) < MIN_BEAT_CONSISTENCY:
            continue  # beats don't share a shape: noise, not ECG
        rr = np.diff(peaks) / fs * 1000.0
        plausible = (rr >= 300) & (rr <= 2000)
        if plausible.mean() < 0.8:
            continue  # too noisy to trust this stretch
        beats += int(peaks.size)
        rr_all.append(rr[plausible])
        seg_quality = float(plausible.mean()) * min(1.0, x.size / (fs * 30))
        if best is None or seg_quality > best[0]:
            best = (seg_quality, start, x, peaks)

    if not rr_all or sum(r.size for r in rr_all) < 20:
        findings.append(_finding("info", "ECG could not be analysed",
            "The ECG signal was too noisy or the electrodes were loose for most of the session. "
            "Check that all three pads stick firmly to clean, dry skin and stay still while measuring.", "ecg"))
        return {"status": "unavailable", "usable_pct": _round(usable_pct, 0), "beats": beats}, None, usable_pct

    rr = np.concatenate(rr_all)
    succ = np.concatenate([np.abs(np.diff(r)) for r in rr_all if r.size > 1])
    succ_rel = np.concatenate([np.abs(np.diff(r)) / r[:-1] for r in rr_all if r.size > 1])
    hr_ecg = 60000.0 / float(np.median(rr))
    sdnn = float(np.std(rr, ddof=1))
    rmssd = float(np.sqrt(np.mean(succ**2))) if succ.size else float("nan")
    irregular = float((succ_rel > 0.2).mean()) if succ_rel.size else 0.0

    rhythm_status = "normal"
    if rr.size >= 30 and irregular > 0.25:
        rhythm_status = "attention"
        findings.append(_finding("attention", "Irregular heartbeat pattern",
            f"About {irregular * 100:.0f}% of heartbeats came at irregular intervals. Extra beats are common in pregnancy "
            "and often harmless, but share this report with your doctor so they can check your rhythm properly.", "ecg"))
    if usable_pct < 60:
        findings.append(_finding("info", "Part of the ECG was unusable",
            f"Only {usable_pct:.0f}% of the ECG recording was clean enough to analyse (loose electrode or movement).", "ecg"))

    metrics = {
        "heart_rate": _round(hr_ecg, 0), "rr_mean_ms": _round(float(rr.mean()), 0),
        "sdnn_ms": _round(sdnn, 0), "rmssd_ms": _round(rmssd, 0),
        "irregular_beats_pct": _round(irregular * 100, 0), "beats": beats,
        "usable_pct": _round(usable_pct, 0),
        "rhythm": "irregular" if rhythm_status == "attention" else "regular", "rhythm_status": rhythm_status,
        "rate_status": _rate_status(hr_ecg, activity),
        "status": _worst(rhythm_status, _rate_status(hr_ecg, activity)),
        "normal_range": "60–100", "unit": "bpm",
    }

    strip = None
    if best is not None:
        _, start, x, peaks = best
        n = min(x.size, 10 * fs)
        offset = max(0, (x.size - n) // 2)
        display = _bandpass(x, fs, 0.5, 40)[offset:offset + n]
        mv = display * (3300.0 / 2 ** session.adc_bits) / 100.0  # AD8232 gain ~100, 3.3 V reference
        step = max(1, fs // 125)
        strip = {
            "hz": fs // step if fs % step == 0 else round(fs / step, 2),
            "start_s": round(start + offset / fs, 2),
            "mv": [round(float(v), 3) for v in mv[::step]],
            "peaks": [int((p - offset) // step) for p in peaks if offset <= p < offset + n],
            "unit": "mV (approx.)",
        }
    return metrics, strip, usable_pct


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------

def analyze(session: Session, pregnancy_month: Optional[int] = None, activity: str = "rest") -> Dict[str, Any]:
    findings: List[Dict[str, str]] = []
    duration_s = session.duration_ms / 1000.0

    hr = _heart_rate(session, activity, findings)
    spo2 = _spo2(session, findings)
    temp = _temperature(session, findings)
    ecg, strip, ecg_usable = _ecg(session, activity, findings)

    if hr is None and ecg and ecg.get("heart_rate") and activity != "exercise":
        # No pulse-oximeter heart rate: fall back to ECG for the resting check.
        h = ecg["heart_rate"]
        if h > 100:
            sev = "urgent" if h > 120 else "attention"
            findings.append(_finding(sev, "Raised resting heart rate (from ECG)",
                f"Your ECG heart rate averaged {h:.0f} bpm while resting. "
                + ("Contact your doctor or midwife today." if sev == "urgent" else "Measure again after resting; tell your doctor if it stays high."),
                "ecg"))

    if hr and ecg and ecg.get("heart_rate") and abs(hr["avg"] - ecg["heart_rate"]) > 10:
        findings.append(_finding("info", "Sensors disagree on heart rate",
            f"The finger sensor read {hr['avg']:.0f} bpm and the ECG {ecg['heart_rate']:.0f} bpm. "
            "This usually means movement or a loose sensor; the ECG value is usually more reliable.", "data_quality"))

    vitals_total = len(session.vitals)
    finger_pct = 100.0 * sum(v.finger for v in session.vitals) / vitals_total if vitals_total else 0.0
    if vitals_total and finger_pct < 70:
        findings.append(_finding("info", "Finger sensor often not detected",
            f"No finger was detected for {100 - finger_pct:.0f}% of the session. Keep your fingertip resting gently on the sensor.",
            "data_quality"))

    usable = hr is not None or spo2 is not None or (ecg is not None and ecg.get("status") != "unavailable")
    if duration_s < MIN_SESSION_S or not usable:
        status = "insufficient"
        findings.insert(0, _finding("info", "Not enough data",
            f"The session lasted {duration_s:.0f} s with {'no' if not usable else 'little'} usable readings. "
            "Measure for at least 2 minutes while sitting still.", "data_quality"))
    else:
        worst = max((SEVERITY_RANK[f["severity"]] for f in findings), default=0)
        status = {0: "normal", 1: "attention", 2: "urgent"}[worst]

    headline = {
        "normal": "All readings are within the normal range",
        "attention": "Some readings need attention",
        "urgent": "Contact your doctor or midwife today",
        "insufficient": "Not enough usable readings to analyse",
    }[status]
    findings.sort(key=lambda f: -SEVERITY_RANK[f["severity"]])

    recommendations = {
        "normal": ["Keep measuring at the same time of day, sitting quietly, to build a reliable trend."],
        "attention": [
            "Rest sitting down for 10 minutes and measure again.",
            "Bring this report to your next appointment, or call sooner if the readings stay the same.",
        ],
        "urgent": [
            "Call your doctor, midwife or maternity unit today and tell them these readings.",
            "Seek emergency care if you have chest pain, trouble breathing, bleeding, a severe headache or fewer baby movements.",
        ],
        "insufficient": ["Sit still, keep your fingertip on the sensor and the ECG pads firmly attached, and measure for 2–5 minutes."],
    }[status]

    t_hr, v_hr = _series(session, "hr")
    t_sp, v_sp = _series(session, "spo2")
    t_tc, v_tc = _series(session, "temp_c")

    return {
        "analysis_version": ANALYSIS_VERSION,
        "analyzed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "headline": headline,
        "demo": session.is_demo,
        "session": {
            "duration_s": round(duration_s),
            "device": session.device or {"device": "unknown"},
            "ecg_hz": session.ecg_hz,
            "activity": activity,
            "pregnancy_month": pregnancy_month,
        },
        "metrics": {"heart_rate": hr, "spo2": spo2, "temperature": temp, "ecg": ecg},
        "findings": findings,
        "recommendations": recommendations,
        "data_quality": {
            "lines_total": session.lines_total,
            "lines_skipped": session.lines_skipped,
            "values_rejected": session.values_rejected,
            "finger_detected_pct": _round(finger_pct, 0),
            "ecg_usable_pct": _round(ecg_usable, 0) if session.ecg else None,
            "truncated": session.truncated,
            "device_restarts": session.restarts,
        },
        "series": {
            "heart_rate": _downsample(t_hr, v_hr),
            "spo2": _downsample(t_sp, v_sp),
            "temperature": _downsample(t_tc, v_tc),
        },
        "ecg_strip": strip,
        "disclaimer": DISCLAIMER,
    }
