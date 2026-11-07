"""PDF vitals report for the patient to keep or show her doctor.

Built from an analysis dict (vitals.analysis.analyze). That dict comes back from the client, so every field is read
defensively and all text is escaped before it reaches ReportLab's mini-markup.
"""

import io
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple
from xml.sax.saxutils import escape

from reportlab.graphics.shapes import Circle, Drawing, Line, PolyLine, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor("#1f1a1d")
MUTED = colors.HexColor("#6e5e66")
LINE = colors.HexColor("#e9dde2")
ACCENT = colors.HexColor("#d6336c")
TONES = {
    "normal": (colors.HexColor("#e6f6ea"), colors.HexColor("#2b8a3e"), "Normal"),
    "attention": (colors.HexColor("#fff4e0"), colors.HexColor("#b35c00"), "Needs attention"),
    "urgent": (colors.HexColor("#ffecec"), colors.HexColor("#c92a2a"), "Urgent"),
    "insufficient": (colors.HexColor("#f1f3f5"), colors.HexColor("#495057"), "Incomplete"),
    "unavailable": (colors.HexColor("#f1f3f5"), colors.HexColor("#495057"), "Not measured"),
}
SEVERITY_LABEL = {"urgent": "Contact today", "attention": "Check", "info": "Note"}


def _s(v: Any, limit: int = 400) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return escape(str(v))[:limit]


def _num(v: Any) -> Optional[float]:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f


def _styles() -> Dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK)
    return {
        "title": ParagraphStyle("title", parent=body, fontName="Helvetica-Bold", fontSize=20, leading=24),
        "eyebrow": ParagraphStyle("eyebrow", parent=body, fontName="Helvetica-Bold", fontSize=8, textColor=ACCENT, leading=10),
        "h2": ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=12, leading=16, spaceBefore=10, spaceAfter=4),
        "body": body,
        "muted": ParagraphStyle("muted", parent=body, textColor=MUTED, fontSize=8.5, leading=12),
        "cell": ParagraphStyle("cell", parent=body, fontSize=9, leading=12, alignment=TA_LEFT),
    }


def _trend(points: Sequence[Sequence[float]], width: float, height: float, lo: float, hi: float,
           band: Optional[Sequence[float]], color: colors.Color, unit: str) -> Drawing:
    d = Drawing(width, height)
    pad_l, pad_b, pad_t = 26, 14, 14
    w, h = width - pad_l - 4, height - pad_b - pad_t
    d.add(Rect(pad_l, pad_b, w, h, fillColor=colors.white, strokeColor=LINE, strokeWidth=0.6))
    if band:
        y0 = pad_b + (max(band[0], lo) - lo) / (hi - lo) * h
        y1 = pad_b + (min(band[1], hi) - lo) / (hi - lo) * h
        d.add(Rect(pad_l, y0, w, y1 - y0, fillColor=colors.HexColor("#eef8f0"), strokeColor=None))
    for v in (lo, (lo + hi) / 2, hi):
        y = pad_b + (v - lo) / (hi - lo) * h
        d.add(String(pad_l - 3, y - 3, f"{v:g}", fontName="Helvetica", fontSize=6.5, fillColor=MUTED, textAnchor="end"))
    pts = [(p[0], p[1]) for p in points if len(p) == 2 and _num(p[0]) is not None and _num(p[1]) is not None]
    if len(pts) >= 2:
        t0, t1 = pts[0][0], pts[-1][0] or 1
        span = max(t1 - t0, 1)
        flat = []
        for t, v in pts:
            flat += [pad_l + (t - t0) / span * w, pad_b + (min(max(v, lo), hi) - lo) / (hi - lo) * h]
        d.add(PolyLine(flat, strokeColor=color, strokeWidth=1.2))
        d.add(String(pad_l, 2, "0 min", fontName="Helvetica", fontSize=6.5, fillColor=MUTED))
        d.add(String(pad_l + w, 2, f"{span / 60:.1f} min", fontName="Helvetica", fontSize=6.5, fillColor=MUTED, textAnchor="end"))
    d.add(String(pad_l, pad_b + h + 4, unit, fontName="Helvetica-Bold", fontSize=7.5, fillColor=INK))
    return d


def _ecg_strip(strip: Dict[str, Any], width: float) -> Optional[Tuple[Drawing, float]]:
    """ECG on standard paper (25 mm/s, 10 mm/mV). Returns the drawing and the seconds shown."""
    mv = [v for v in (strip.get("mv") or []) if _num(v) is not None][:5000]
    hz = _num(strip.get("hz")) or 0
    if len(mv) < 50 or hz <= 0:
        return None
    px_per_s = 25 * mm  # standard ECG paper speed: 25 mm/s
    mv = mv[: int(width / px_per_s * hz)]  # as many seconds as fit the page at true scale
    seconds = len(mv) / hz
    px_per_mv = 10 * mm  # 10 mm/mV
    lo, hi = min(mv), max(mv)
    height = max(28 * mm, (hi - lo) * px_per_mv + 8 * mm)
    w = seconds * px_per_s
    d = Drawing(w, height)
    small = 1 * mm  # 1 mm boxes
    x = 0.0
    i = 0
    while x <= w:
        d.add(Line(x, 0, x, height, strokeColor=colors.HexColor("#f6c9d6" if i % 5 == 0 else "#fbe7ee"), strokeWidth=0.5 if i % 5 == 0 else 0.25))
        x += small
        i += 1
    y, i = 0.0, 0
    while y <= height:
        d.add(Line(0, y, w, y, strokeColor=colors.HexColor("#f6c9d6" if i % 5 == 0 else "#fbe7ee"), strokeWidth=0.5 if i % 5 == 0 else 0.25))
        y += 1 * mm
        i += 1
    base = 4 * mm - lo * px_per_mv
    flat = []
    for k, v in enumerate(mv):
        flat += [k / hz * px_per_s, base + v * px_per_mv]
    d.add(PolyLine(flat, strokeColor=INK, strokeWidth=0.7))
    for p in strip.get("peaks") or []:
        if isinstance(p, int) and 0 <= p < len(mv):
            d.add(Circle(p / hz * px_per_s, base + mv[p] * px_per_mv + 2.2 * mm, 0.7 * mm, fillColor=ACCENT, strokeColor=None))
    return d, seconds


def build_report(analysis: Dict[str, Any], patient: Optional[Dict[str, Any]] = None) -> bytes:
    patient = patient or {}
    st = _styles()
    status = analysis.get("status") if analysis.get("status") in TONES else "insufficient"
    bg, fg, label = TONES[status]
    session = analysis.get("session") or {}
    metrics = analysis.get("metrics") or {}
    demo = bool(analysis.get("demo"))

    buf = io.BytesIO()

    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, "MamaCare vital signs report · not a medical diagnosis")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
        if demo:
            canvas.setFont("Helvetica-Bold", 54)
            canvas.setFillColor(colors.Color(0.84, 0.2, 0.42, alpha=0.08))
            canvas.translate(A4[0] / 2, A4[1] / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, "SAMPLE DATA")
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=18 * mm, title="Vital signs report", author="MamaCare")
    width = A4[0] - 36 * mm
    story: List[Any] = []

    when = analysis.get("analyzed_at") or datetime.utcnow().isoformat()
    try:
        when_txt = datetime.fromisoformat(str(when).replace("Z", "+00:00")).strftime("%d %b %Y, %H:%M UTC")
    except ValueError:
        when_txt = _s(when, 40)
    story += [Paragraph("MAMACARE · HOME MONITORING", st["eyebrow"]), Spacer(1, 2), Paragraph("Vital signs report", st["title"]), Spacer(1, 6)]

    meta = [
        ("Patient", _s(patient.get("name"), 80) or "—"),
        ("Pregnancy", f"Month {_s(patient.get('pregnancy_month') or session.get('pregnancy_month'), 2)}"
            if (patient.get("pregnancy_month") or session.get("pregnancy_month")) else "—"),
        ("Recorded", when_txt),
        ("Duration", f"{int(_num(session.get('duration_s')) or 0) // 60} min {int(_num(session.get('duration_s')) or 0) % 60} s"),
        ("Device", _s((session.get("device") or {}).get("device"), 40) or "—"),
        ("Activity", "At rest" if session.get("activity") != "exercise" else "During exercise"),
    ]
    meta_rows = [[Paragraph(f"<font color='#6e5e66'>{k}</font><br/><b>{v}</b>", st["cell"]) for k, v in meta[i:i + 3]] for i in (0, 3)]
    mt = Table(meta_rows, colWidths=[width / 3] * 3)
    mt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [mt, Spacer(1, 8)]

    fg_hex = "#" + fg.hexval()[2:]
    banner = Table([[Paragraph(f"<font color='{fg_hex}'><b>{_s(label)}</b></font>"
                               f"<br/><font size='12'><b>{_s(analysis.get('headline'), 120)}</b></font>", st["body"])]],
                   colWidths=[width])
    banner.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("BOX", (0, 0), (-1, -1), 0.8, fg),
                                ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                                ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
    story += [banner, Spacer(1, 6)]
    if demo:
        story.append(Paragraph("<b>Sample data:</b> this report was made from simulated readings, not a real measurement.", st["muted"]))

    # ---- results table
    def row(name, m, value_fn):
        if not isinstance(m, dict) or m.get("status") == "unavailable":
            return [name, "Not measured", "—", TONES["unavailable"][2]]
        tone = TONES.get(m.get("status"), TONES["normal"])
        return [name, value_fn(m), _s(m.get("normal_range")) or "—", tone[2] if m.get("status") != "normal" else "Normal"]

    hr, sp, tc, ecg = (metrics.get(k) for k in ("heart_rate", "spo2", "temperature", "ecg"))
    rows = [["Measurement", "Result", "Normal range", "Status"]]
    rows.append(row("Heart rate (finger)", hr, lambda m: f"avg {_s(m.get('avg'))} bpm (min {_s(m.get('min'))}, max {_s(m.get('max'))})"))
    rows.append(row("Blood oxygen (SpO2)", sp, lambda m: f"avg {_s(m.get('avg'))}% (lowest sustained {_s(m.get('sustained_min'))}%)"))
    rows.append(row("Temperature", tc, lambda m: f"avg {_s(m.get('avg'))} °C (max {_s(m.get('sustained_max'))} °C)"))
    if isinstance(ecg, dict) and ecg.get("status") != "unavailable":
        rate_st, rhythm_st = ecg.get("rate_status", "normal"), ecg.get("rhythm_status", "normal")
        rows.append(["ECG heart rate", f"{_s(ecg.get('heart_rate'))} bpm", "60–100",
                     "Normal" if rate_st == "normal" else TONES.get(rate_st, TONES["attention"])[2]])
        rows.append(["Heart rhythm (ECG)", f"{_s(ecg.get('rhythm')).capitalize()} ({_s(ecg.get('irregular_beats_pct'))}% irregular beats)",
                     "Regular", "Normal" if rhythm_st == "normal" else TONES.get(rhythm_st, TONES["attention"])[2]])
        rows.append(["Heart rate variability", f"SDNN {_s(ecg.get('sdnn_ms'))} ms, RMSSD {_s(ecg.get('rmssd_ms'))} ms",
                     "—", "For your doctor"])
    else:
        rows.append(["ECG", "Not analysable" if ecg else "Not measured", "—", TONES["unavailable"][2]])
    table = Table([[Paragraph(_s(c) if r else f"<b>{_s(c)}</b>", st["cell"]) for c in row_] for r, row_ in enumerate(rows)],
                  colWidths=[width * 0.27, width * 0.38, width * 0.15, width * 0.20], repeatRows=1)
    style = [("LINEBELOW", (0, 0), (-1, 0), 0.8, INK), ("LINEBELOW", (0, 1), (-1, -1), 0.3, LINE),
             ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    for i, r in enumerate(rows[1:], start=1):
        tone = next((t for t in TONES.values() if t[2] == r[3]), None)
        if tone and r[3] not in ("Normal",):
            style.append(("TEXTCOLOR", (3, i), (3, i), tone[1]))
    table.setStyle(TableStyle(style))
    story += [Paragraph("Results", st["h2"]), table]

    # ---- findings
    findings = [f for f in (analysis.get("findings") or []) if isinstance(f, dict)][:12]
    if findings:
        story.append(Paragraph("What we found", st["h2"]))
        for f in findings:
            sev = f.get("severity") if f.get("severity") in SEVERITY_LABEL else "info"
            color = {"urgent": "#c92a2a", "attention": "#b35c00", "info": "#495057"}[sev]
            story.append(Paragraph(f"<font color='{color}'><b>{SEVERITY_LABEL[sev]}:</b></font> <b>{_s(f.get('title'), 100)}.</b> "
                                   f"{_s(f.get('detail'), 500)}", st["body"]))
            story.append(Spacer(1, 3))

    recs = [r for r in (analysis.get("recommendations") or []) if isinstance(r, str)][:6]
    if recs:
        story.append(Paragraph("What to do next", st["h2"]))
        for r in recs:
            story.append(Paragraph(f"• {_s(r)}", st["body"]))

    # ---- charts
    series = analysis.get("series") or {}
    charts = []
    if series.get("heart_rate"):
        charts.append(_trend(series["heart_rate"], width / 2 - 4, 42 * mm, 40, 160, (60, 100), ACCENT, "Heart rate (bpm)"))
    if series.get("spo2"):
        charts.append(_trend(series["spo2"], width / 2 - 4, 42 * mm, 85, 100, (95, 100), colors.HexColor("#1971c2"), "SpO2 (%)"))
    if charts:
        story.append(Paragraph("Trends during the session", st["h2"]))
        story.append(Table([charts], colWidths=[width / 2] * len(charts)))

    strip = analysis.get("ecg_strip")
    if isinstance(strip, dict):
        drawn = _ecg_strip(strip, width)
        if drawn is not None:
            drawing, seconds = drawn
            story.append(KeepTogether([
                Paragraph(f"ECG sample ({seconds:.1f} seconds)", st["h2"]),
                drawing,
                Paragraph("25 mm/s, 10 mm/mV (approximate amplitude). Dots mark detected heartbeats. "
                          "A home single-lead ECG cannot rule out heart conditions.", st["muted"]),
            ]))

    dq = analysis.get("data_quality") or {}
    story += [Spacer(1, 8), Paragraph(
        f"Data quality: finger detected {_s(dq.get('finger_detected_pct'))}% of the time"
        + (f", ECG usable {_s(dq.get('ecg_usable_pct'))}%" if dq.get("ecg_usable_pct") is not None else "")
        + f", {_s(dq.get('lines_skipped'))} unreadable lines skipped. Analysis v{_s(analysis.get('analysis_version'), 8)}.", st["muted"]),
        Spacer(1, 6), Paragraph(_s(analysis.get("disclaimer"), 600), st["muted"])]

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
