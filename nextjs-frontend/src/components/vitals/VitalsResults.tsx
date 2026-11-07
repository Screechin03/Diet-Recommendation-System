"use client";

import { useState, type ReactNode } from "react";
import { AlertIcon, CheckIcon, InfoIcon } from "@/components/report/icons";
import { EcgStrip, TrendChart } from "@/components/vitals/Charts";
import { STATUS_COPY, formatDuration, type MetricStatus, type VitalsAnalysis } from "@/lib/vitals";

const TONE = {
  green: { banner: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30", text: "text-emerald-800 dark:text-emerald-300", dot: "bg-emerald-500" },
  amber: { banner: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30", text: "text-amber-800 dark:text-amber-300", dot: "bg-amber-500" },
  red: { banner: "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30", text: "text-rose-800 dark:text-rose-300", dot: "bg-rose-500" },
  gray: { banner: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40", text: "text-zinc-700 dark:text-zinc-300", dot: "bg-zinc-400" },
} as const;

const METRIC_TONE: Record<MetricStatus, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900" },
  attention: { label: "Check", cls: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900" },
  urgent: { label: "Urgent", cls: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900" },
  unavailable: { label: "No reading", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700" },
};

function MetricCard({ title, value, unit, sub, range, status }: { title: string; value: ReactNode; unit?: string; sub?: string; range?: string; status: MetricStatus }) {
  const tone = METRIC_TONE[status];
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500">{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tone.cls}`}>{tone.label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
        {unit ? <span className="text-sm text-zinc-500">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
      {range ? <div className="mt-auto pt-3 text-[11px] text-zinc-400">Normal {range}</div> : null}
    </div>
  );
}

export function VitalsResults({
  analysis,
  onSave,
  saved,
  saving,
  onNew,
}: {
  analysis: VitalsAnalysis;
  onSave?: () => void;
  saved?: boolean;
  saving?: boolean;
  onNew?: () => void;
}) {
  const [name, setName] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const copy = STATUS_COPY[analysis.status];
  const tone = TONE[copy.tone];
  const { heart_rate: hr, spo2, temperature: temp, ecg } = analysis.metrics;
  const ecgOk = ecg && ecg.status !== "unavailable";

  async function downloadPdf() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch("/api/vitals/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysis,
          patient: { name: name.trim() || null, pregnancy_month: analysis.session.pregnancy_month },
        }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mamacare-vitals-${analysis.analyzed_at.slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setDownloadError("Couldn't create the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${tone.banner}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${tone.text}`}>
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
            {copy.label}
          </span>
          {analysis.demo ? (
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-zinc-900">Sample data</span>
          ) : null}
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{analysis.headline}</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {formatDuration(analysis.session.duration_s)} min recording · {analysis.session.activity === "exercise" ? "during exercise" : "at rest"}
          {analysis.session.pregnancy_month ? ` · month ${analysis.session.pregnancy_month} of pregnancy` : ""}
          {analysis.session.device?.device ? ` · ${analysis.session.device.device}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard title="Heart rate" value={hr?.avg ?? "—"} unit={hr ? "bpm" : undefined}
          sub={hr ? `${hr.min}–${hr.max} bpm` : "Finger sensor not detected"} range={hr?.normal_range ? `${hr.normal_range} bpm` : undefined}
          status={hr?.status ?? "unavailable"} />
        <MetricCard title="Blood oxygen" value={spo2?.avg ?? "—"} unit={spo2 ? "%" : undefined}
          sub={spo2 ? `lowest sustained ${spo2.sustained_min}%` : "Finger sensor not detected"} range={spo2 ? "95–100 %" : undefined}
          status={spo2?.status ?? "unavailable"} />
        <MetricCard title="Temperature" value={temp?.avg ?? "—"} unit={temp ? "°C" : undefined}
          sub={temp ? `max ${temp.sustained_max} °C` : "No body-temperature sensor"} range={temp ? "36.1–37.4 °C" : undefined}
          status={temp?.status ?? "unavailable"} />
        <MetricCard title="ECG" value={ecgOk ? ecg.heart_rate : "—"} unit={ecgOk ? "bpm" : undefined}
          sub={ecgOk ? `${ecg.rhythm === "irregular" ? "Irregular" : "Regular"} rhythm · ${ecg.beats} beats` : ecg ? "Signal too noisy" : "No ECG recorded"}
          range={ecgOk ? "60–100 bpm, regular" : undefined} status={ecg?.status ?? "unavailable"} />
      </div>

      {analysis.findings.length ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold">What we found</h3>
          <ul className="mt-3 space-y-3">
            {analysis.findings.map((f, i) => {
              const cls = f.severity === "urgent" ? "text-rose-600" : f.severity === "attention" ? "text-amber-600" : "text-zinc-400";
              return (
                <li key={i} className="flex gap-3">
                  <span className={`mt-0.5 shrink-0 ${cls}`}>{f.severity === "info" ? <InfoIcon size={18} /> : <AlertIcon size={18} />}</span>
                  <div>
                    <div className="text-sm font-semibold">{f.title}</div>
                    <p className="mt-0.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{f.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold">What to do next</h3>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {analysis.recommendations.map((r, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 text-emerald-600"><CheckIcon size={16} /></span>
              <span className="leading-6">{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {analysis.series.heart_rate.length ? (
          <TrendChart points={analysis.series.heart_rate} domain={[40, 160]} normal={[60, 100]} color="#e11d48" label="Heart rate" unit="bpm" />
        ) : null}
        {analysis.series.spo2.length ? (
          <TrendChart points={analysis.series.spo2} domain={[85, 100]} normal={[95, 100]} color="#2563eb" label="Blood oxygen (SpO₂)" unit="%" />
        ) : null}
        {analysis.series.temperature.length ? (
          <TrendChart points={analysis.series.temperature} domain={[35, 39.5]} normal={[36.1, 37.4]} color="#d97706" label="Temperature" unit="°C" />
        ) : null}
      </div>

      {analysis.ecg_strip && ecgOk ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">ECG sample</h3>
            <span className="text-xs text-zinc-500">25 mm/s · 10 mm/mV (approx.) · dots = detected beats</span>
          </div>
          <div className="mt-3">
            <EcgStrip mv={analysis.ecg_strip.mv} hz={analysis.ecg_strip.hz} peaks={analysis.ecg_strip.peaks} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Heart rate", `${ecg.heart_rate} bpm`],
              ["Irregular beats", `${ecg.irregular_beats_pct}%`],
              ["HRV (SDNN)", `${ecg.sdnn_ms} ms`],
              ["HRV (RMSSD)", `${ecg.rmssd_ms} ms`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
                <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold">Your report</h3>
        <p className="mt-1 text-sm text-zinc-500">A PDF with these results and the ECG sample, to keep or show your doctor.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Your name on the report (optional)"
            className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-950"
          />
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="h-11 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900"
          >
            {downloading ? "Creating PDF…" : "Download PDF report"}
          </button>
        </div>
        {downloadError ? <p className="mt-2 text-sm text-rose-600">{downloadError}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {onSave ? (
            <button
              onClick={onSave}
              disabled={saved || saving}
              className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              {saved ? "Saved to your history ✓" : saving ? "Saving…" : "Save to my history"}
            </button>
          ) : null}
          {onNew ? (
            <button onClick={onNew} className="h-10 rounded-xl px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40">
              New measurement
            </button>
          ) : null}
        </div>
      </section>

      <p className="px-1 text-xs leading-5 text-zinc-500">
        Data quality: finger detected {analysis.data_quality.finger_detected_pct ?? "—"}% of the time
        {analysis.data_quality.ecg_usable_pct != null ? `, ECG usable ${analysis.data_quality.ecg_usable_pct}%` : ""}
        {analysis.data_quality.lines_skipped ? `, ${analysis.data_quality.lines_skipped} unreadable lines skipped` : ""}.{" "}
        {analysis.disclaimer}
      </p>
    </div>
  );
}
