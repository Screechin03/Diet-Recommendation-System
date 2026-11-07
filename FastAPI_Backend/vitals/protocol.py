"""Parser for the vitals device protocol v1 (see Docs/DEVICE_PROTOCOL.md).

One JSON object per line; unknown fields/types are ignored and malformed lines are skipped,
so a stray debug print or a half-written last line on an SD card never breaks an import.
"""

import json
import math
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

PROTOCOL_VERSION = 1
MAX_LINES = 250_000
MAX_SESSION_MS = 30 * 60 * 1000 + 5_000  # 30 minutes (+ slack)
MAX_ECG_SAMPLES = 30 * 60 * 1000  # 1000 Hz for 30 min

HR_RANGE = (30, 220)
SPO2_RANGE = (70, 100)
TEMP_RANGE = (30.0, 43.0)
ECG_HZ_RANGE = (125, 1000)
RESTART_GAP_MS = 5_000


class ProtocolError(ValueError):
    """The data can't be used at all (not a device session)."""


@dataclass
class VitalSample:
    ms: int
    hr: Optional[float]
    spo2: Optional[float]
    temp_c: Optional[float]
    finger: bool


@dataclass
class EcgChunk:
    ms: int
    lo: bool
    samples: List[float]


@dataclass
class Session:
    device: Dict[str, Any] = field(default_factory=dict)
    ecg_hz: int = 250
    adc_bits: int = 12
    vitals: List[VitalSample] = field(default_factory=list)
    ecg: List[EcgChunk] = field(default_factory=list)
    lines_total: int = 0
    lines_skipped: int = 0
    values_rejected: int = 0
    ended: bool = False
    truncated: bool = False
    restarts: int = 0  # device rebooted mid-file; only the latest session is kept

    @property
    def is_demo(self) -> bool:
        return str(self.device.get("device", "")).lower() == "simulator"

    @property
    def start_ms(self) -> int:
        starts = ([self.vitals[0].ms] if self.vitals else []) + ([self.ecg[0].ms] if self.ecg else [])
        return min(starts) if starts else 0

    @property
    def duration_ms(self) -> int:
        """From the first to the last reading (a live recording can start mid-session, e.g. at ms=50000)."""
        ends = [v.ms for v in self.vitals]
        if self.ecg:
            last = self.ecg[-1]
            ends.append(last.ms + int(len(last.samples) * 1000 / self.ecg_hz))
        return max(ends) - self.start_ms if ends else 0


def _num(value: Any) -> Optional[float]:
    if isinstance(value, bool) or value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _in_range(value: Optional[float], lo: float, hi: float) -> Optional[float]:
    if value is None:
        return None
    return value if lo <= value <= hi else None


def parse_lines(lines: Iterable[str]) -> Session:
    session = Session()
    ecg_total = 0
    max_ms = -1

    for raw in lines:
        session.lines_total += 1
        if session.lines_total > MAX_LINES:
            session.truncated = True
            break
        line = raw.strip()
        if not line:
            session.lines_total -= 1
            continue
        try:
            msg = json.loads(line)
        except (ValueError, TypeError):
            session.lines_skipped += 1
            continue
        if not isinstance(msg, dict):
            session.lines_skipped += 1
            continue

        kind = msg.get("t")
        if kind == "hello":
            session.device = {
                "device": str(msg.get("device", ""))[:64],
                "fw": str(msg.get("fw", ""))[:32],
                "protocol": msg.get("v"),
            }
            hz = _num(msg.get("ecg_hz"))
            if hz and ECG_HZ_RANGE[0] <= hz <= ECG_HZ_RANGE[1]:
                session.ecg_hz = int(hz)
            bits = _num(msg.get("adc_bits"))
            if bits and 8 <= bits <= 24:
                session.adc_bits = int(bits)
            continue

        if kind == "end":
            session.ended = True
            continue

        ms = _num(msg.get("ms"))
        if ms is None or ms < 0:
            session.lines_skipped += 1
            continue
        ms = int(ms)
        if ms > MAX_SESSION_MS:
            session.truncated = True
            continue

        if max_ms - ms > RESTART_GAP_MS:
            # The clock jumped far back: the device rebooted and appended a new session to the same file.
            # Keep only the latest session rather than mixing two timelines.
            session.vitals.clear()
            session.ecg.clear()
            ecg_total = 0
            session.restarts += 1
            max_ms = -1
        max_ms = max(max_ms, ms)  # small jitter is fine: readings are sorted at the end

        if kind == "vitals":
            finger = msg.get("finger", True) is not False
            hr_raw, spo2_raw, temp_raw = _num(msg.get("hr")), _num(msg.get("spo2")), _num(msg.get("temp_c"))
            hr = _in_range(hr_raw, *HR_RANGE) if finger else None
            spo2 = _in_range(spo2_raw, *SPO2_RANGE) if finger else None
            temp = _in_range(temp_raw, *TEMP_RANGE)
            session.values_rejected += sum(
                1 for raw_v, ok in ((hr_raw, hr), (spo2_raw, spo2), (temp_raw, temp)) if raw_v is not None and ok is None and finger
            )
            session.vitals.append(VitalSample(ms=ms, hr=hr, spo2=spo2, temp_c=temp, finger=finger))
        elif kind == "ecg":
            samples_raw = msg.get("s")
            if not isinstance(samples_raw, list) or not samples_raw:
                session.lines_skipped += 1
                continue
            hi = 2 ** session.adc_bits - 1
            samples = []
            for v in samples_raw:
                f = _num(v)
                samples.append(f if f is not None and 0 <= f <= hi else math.nan)
            if ecg_total + len(samples) > MAX_ECG_SAMPLES:
                session.truncated = True
                continue
            ecg_total += len(samples)
            session.ecg.append(EcgChunk(ms=ms, lo=msg.get("lo") is True, samples=samples))
        # unknown types: ignored on purpose

    session.vitals.sort(key=lambda v: v.ms)
    session.ecg.sort(key=lambda c: c.ms)
    if not session.vitals and not session.ecg:
        raise ProtocolError(
            "No vitals or ECG readings were found. Check that the file comes from the MamaCare device "
            "(one JSON object per line, see the device protocol)."
        )
    return session


def parse_bytes(data: bytes) -> Session:
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        raise ProtocolError("The file is UTF-16 encoded; the device must write UTF-8 text.")
    text = data.decode("utf-8", errors="replace").lstrip("﻿")
    return parse_lines(text.splitlines())
