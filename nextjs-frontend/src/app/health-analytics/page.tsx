"use client";

import { useState } from "react";
import type { HealthAnalyticsInput, RiskPredictionOut } from "@/lib/types";
import { safeJson } from "@/lib/utils";

const inputClass =
  "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";

type RefinedOutput = {
  title?: string;
  summary?: string;
  bullets?: string[];
};

type RiskRecommendations = {
  immediate_actions?: string[];
  lifestyle_changes?: string[];
  monitoring_requirements?: string[];
  medical_consultations?: string[];
};

type ModelPerformanceOut = {
  model_trained?: boolean;
  available_models?: string[];
  feature_importance?: Record<string, Record<string, number>>;
  success?: boolean;
  error?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function probabilityToPercent(probability: unknown): number | null {
  if (probability == null) return null;
  const p = asNumber(probability, NaN);
  if (!Number.isFinite(p)) return null;
  if (p <= 1) return clamp(Math.round(p * 100), 0, 100);
  if (p <= 100) return clamp(Math.round(p), 0, 100);
  return 100;
}

function badgeClassesForRisk(level: string | undefined): string {
  const l = (level ?? "").toLowerCase();
  if (l.includes("high")) {
    return "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900/50";
  }
  if (l.includes("medium") || l.includes("moderate")) {
    return "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/50";
  }
  return "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/50";
}

function ProgressBar({ value, min, max }: { value: number; min: number; max: number }) {
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type SparkPoint = { x: number; y: number };

function Sparkline({
  values,
  min,
  max,
  height = 44,
}: {
  values: Array<number | null | undefined>;
  min?: number;
  max?: number;
  height?: number;
}) {
  const cleaned = values
    .map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
    .filter((v): v is number => v != null);

  if (cleaned.length < 2) {
    return <div className="h-11 rounded-md bg-zinc-50 dark:bg-zinc-900/40" />;
  }

  const localMin = min ?? Math.min(...cleaned);
  const localMax = max ?? Math.max(...cleaned);
  const range = localMax - localMin || 1;
  const w = 160;
  const h = height;

  const points: SparkPoint[] = cleaned.map((v, idx) => {
    const x = (idx / (cleaned.length - 1)) * (w - 4) + 2;
    const y = (1 - (v - localMin) / range) * (h - 8) + 4;
    return { x, y };
  });

  const d = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      role="img"
      aria-label="Trend"
      className="rounded-md bg-zinc-50 p-1 dark:bg-zinc-900/40"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-zinc-900 dark:text-zinc-100"
        points={d}
      />
      <circle
        cx={points[points.length - 1]?.x}
        cy={points[points.length - 1]?.y}
        r="2.5"
        className="fill-zinc-900 dark:fill-zinc-100"
      />
    </svg>
  );
}

function HorizontalBars({
  title,
  items,
  valueLabel,
  maxItems = 8,
  card = true,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  valueLabel?: (v: number) => string;
  maxItems?: number;
  card?: boolean;
}) {
  const cleaned = items
    .filter((i) => Number.isFinite(i.value))
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, maxItems);

  const max = cleaned.length ? Math.max(...cleaned.map((x) => x.value)) : 1;

  const content = cleaned.length ? (
    <div className="space-y-3">
      {cleaned.map((row) => {
        const pct = (row.value / max) * 100;
        return (
          <div key={row.label} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {row.label}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {valueLabel ? valueLabel(row.value) : row.value.toFixed(3)}
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="text-sm text-zinc-600 dark:text-zinc-300">No data yet.</div>
  );

  if (!card) {
    return content;
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
      <div className="mt-4">{content}</div>
    </div>
  );
}

function MetricBar({
  label,
  value,
  unit,
  min,
  max,
  normal,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  normal?: [number, number];
}) {
  const current = clamp(value, min, max);
  const pct = ((current - min) / (max - min)) * 100;
  const normalLeft = normal ? ((clamp(normal[0], min, max) - min) / (max - min)) * 100 : null;
  const normalRight = normal ? ((clamp(normal[1], min, max) - min) / (max - min)) * 100 : null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</div>
        <div className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold">{Number.isFinite(value) ? value : "-"}</span>
          {unit ? <span className="text-zinc-500 dark:text-zinc-400"> {unit}</span> : null}
        </div>
      </div>

      <div className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {normalLeft != null && normalRight != null ? (
          <div
            className="absolute inset-y-0 rounded-full bg-emerald-500/50"
            style={{ left: `${normalLeft}%`, width: `${Math.max(0, normalRight - normalLeft)}%` }}
          />
        ) : null}
        <div className="absolute inset-y-0 left-0 rounded-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  items,
  empty,
}: {
  title: string;
  items: unknown;
  empty: string;
}) {
  const list = Array.isArray(items) ? (items as unknown[]) : [];
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</div>
      {list.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          {list.map((x, idx) => (
            <li key={idx}>{String(x)}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{empty}</div>
      )}
    </div>
  );
}

function defaultHealth(): HealthAnalyticsInput {
  return {
    age: 28,
    systolic_bp: 120,
    diastolic_bp: 80,
    blood_sugar: 7.0,
    body_temp: 98.6,
    bmi: 22.0,
    heart_rate: 75,
    previous_complications: false,
    preexisting_diabetes: false,
    gestational_diabetes: false,
    mental_health_issues: false,
    smoking_history: false,
    alcohol_consumption: "none",
    exercise_frequency: "moderate",
    sleep_hours: 8,
    stress_level: "low",
  };
}

export default function HealthAnalyticsPage() {
  const [health, setHealth] = useState<HealthAnalyticsInput>(() => defaultHealth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskPredictionOut | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelPerformanceOut | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("random_forest");
  const [useGemini, setUseGemini] = useState<boolean>(false);
  const [refined, setRefined] = useState<RefinedOutput | null>(null);
  const [history, setHistory] = useState<
    Array<{
      ts: number;
      riskPct: number | null;
      bmi: number;
      sugar: number;
      sys: number;
      dia: number;
      hr: number;
      temp: number;
    }>
  >([]);

  async function assess() {
    setLoading(true);
    setError(null);
    setResult(null);
    setRefined(null);

    try {
      const res = await fetch("/api/predict_pregnancy_risk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ health_data: health }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = await safeJson<RiskPredictionOut>(res);
      setResult(data);

      const riskPct = probabilityToPercent(data.risk_assessment?.risk_probability);
      setHistory((prev) => {
        const next = [
          ...prev,
          {
            ts: Date.now(),
            riskPct,
            bmi: asNumber(health.bmi, 22),
            sugar: asNumber(health.blood_sugar, 7),
            sys: asNumber(health.systolic_bp, 120),
            dia: asNumber(health.diastolic_bp, 80),
            hr: asNumber(health.heart_rate, 75),
            temp: asNumber(health.body_temp, 98.6),
          },
        ];
        return next.slice(-20);
      });

      if (useGemini) {
        const refinePayload = {
          health_data: health,
          risk_response: data,
        };
        const refineRes = await fetch("/api/refine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "risk", payload: refinePayload }),
        });
        if (refineRes.ok) {
          const refineJson = (await refineRes.json()) as { refined?: RefinedOutput | null };
          setRefined(refineJson?.refined ?? null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadModelPerformance() {
    setModelInfo(null);
    try {
      const res = await fetch("/api/model_performance");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = (await res.json()) as ModelPerformanceOut;
      setModelInfo(json);
      const available = Array.isArray(json?.available_models) ? json.available_models : [];
      if (available.length && !available.includes(selectedModel)) {
        setSelectedModel(available[0]);
      }
    } catch (e) {
      setModelInfo({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  const riskSeries = history.map((h) => h.riskPct);
  const bmiSeries = history.map((h) => h.bmi);
  const sugarSeries = history.map((h) => h.sugar);

  const outOfRangeSignals: Array<{ label: string; value: number }> = (() => {
    const measures: Array<{
      label: string;
      value: number;
      min: number;
      max: number;
      normal: [number, number];
    }> = [
      { label: "BMI", value: asNumber(health.bmi, 22), min: 15, max: 45, normal: [18.5, 24.9] },
      { label: "Blood sugar", value: asNumber(health.blood_sugar, 7), min: 3, max: 14, normal: [4, 7.8] },
      { label: "Systolic BP", value: asNumber(health.systolic_bp, 120), min: 80, max: 200, normal: [90, 120] },
      { label: "Diastolic BP", value: asNumber(health.diastolic_bp, 80), min: 40, max: 130, normal: [60, 80] },
      { label: "Heart rate", value: asNumber(health.heart_rate, 75), min: 40, max: 160, normal: [60, 100] },
      { label: "Body temp", value: asNumber(health.body_temp, 98.6), min: 95, max: 104, normal: [97, 99.5] },
    ];

    return measures
      .map((m) => {
        const clamped = clamp(m.value, m.min, m.max);
        const [n0, n1] = m.normal;
        const outside = clamped < n0 ? n0 - clamped : clamped > n1 ? clamped - n1 : 0;
        const score = outside / (m.max - m.min);
        return { label: m.label, value: score };
      })
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  })();

  const featureImportanceRows: Array<{ label: string; value: number }> = (() => {
    const fi = modelInfo?.feature_importance;
    const perModel = fi && typeof fi === "object" ? (fi as Record<string, unknown>)[selectedModel] : null;
    if (!perModel || typeof perModel !== "object") return [];
    return Object.entries(perModel as Record<string, unknown>)
      .map(([label, v]) => ({ label, value: asNumber(v, 0) }))
      .filter((x) => x.value > 0);
  })();

  const recommendations: RiskRecommendations | null = (() => {
    if (!result?.recommendations || typeof result.recommendations !== "object") return null;
    return result.recommendations as RiskRecommendations;
  })();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Health Analytics</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            Predict pregnancy risk using the backend ML model.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={useGemini}
              onChange={(e) => setUseGemini(e.target.checked)}
            />
            Refine with Gemini
          </label>
          <button
            onClick={loadModelPerformance}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            Model performance
          </button>
          <button
            onClick={assess}
            disabled={loading}
            className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {loading ? "Assessing…" : "Assess risk"}
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Age</span>
              <input
                className={inputClass}
                type="number"
                value={health.age}
                onChange={(e) => setHealth((h) => ({ ...h, age: Number(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">BMI</span>
              <input
                className={inputClass}
                type="number"
                step="0.1"
                value={health.bmi ?? 22}
                onChange={(e) => setHealth((h) => ({ ...h, bmi: Number(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Systolic BP</span>
              <input
                className={inputClass}
                type="number"
                value={health.systolic_bp ?? 120}
                onChange={(e) => setHealth((h) => ({ ...h, systolic_bp: Number(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Diastolic BP</span>
              <input
                className={inputClass}
                type="number"
                value={health.diastolic_bp ?? 80}
                onChange={(e) => setHealth((h) => ({ ...h, diastolic_bp: Number(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Blood sugar</span>
              <input
                className={inputClass}
                type="number"
                step="0.1"
                value={health.blood_sugar ?? 7}
                onChange={(e) => setHealth((h) => ({ ...h, blood_sugar: Number(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Heart rate</span>
              <input
                className={inputClass}
                type="number"
                value={health.heart_rate ?? 75}
                onChange={(e) => setHealth((h) => ({ ...h, heart_rate: Number(e.target.value) }))}
              />
            </label>
          </div>

          <div className="mt-5 grid gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={!!health.previous_complications}
                onChange={(e) => setHealth((h) => ({ ...h, previous_complications: e.target.checked }))}
              />
              Previous complications
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={!!health.preexisting_diabetes}
                onChange={(e) => setHealth((h) => ({ ...h, preexisting_diabetes: e.target.checked }))}
              />
              Preexisting diabetes
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={!!health.gestational_diabetes}
                onChange={(e) => setHealth((h) => ({ ...h, gestational_diabetes: e.target.checked }))}
              />
              Gestational diabetes
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={!!health.mental_health_issues}
                onChange={(e) => setHealth((h) => ({ ...h, mental_health_issues: e.target.checked }))}
              />
              Mental health concerns
            </label>
          </div>

          {error ? (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4">
          {refined ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-base font-semibold">{String(refined.title ?? "Refined summary")}</div>
              {refined.summary ? (
                <p className="mt-2 text-zinc-700 dark:text-zinc-300">{String(refined.summary)}</p>
              ) : null}
              {Array.isArray(refined.bullets) && refined.bullets.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                  {refined.bullets.slice(0, 10).map((b, idx: number) => (
                    <li key={idx}>{String(b)}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                Gemini output is informational and not medical advice.
              </div>
            </div>
          ) : null}

          {result ? (
            <>
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-60">
                    <div className="text-base font-semibold">Risk assessment</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${badgeClassesForRisk(
                          String(result.risk_assessment?.risk_level ?? "Low"),
                        )}`}
                      >
                        {String(result.risk_assessment?.risk_level ?? "Unknown")}
                      </span>
                      {probabilityToPercent(result.risk_assessment?.risk_probability) != null ? (
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                          {probabilityToPercent(result.risk_assessment?.risk_probability)}%
                        </span>
                      ) : null}
                      {typeof result.risk_assessment?.confidence === "number" ? (
                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                          Confidence {Math.round(clamp(result.risk_assessment.confidence, 0, 1) * 100)}%
                        </span>
                      ) : null}
                    </div>
                    {Array.isArray(result.risk_assessment?.risk_factors) &&
                    result.risk_assessment?.risk_factors?.length ? (
                      <div className="mt-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Key factors
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {result.risk_assessment.risk_factors.slice(0, 12).map((f) => (
                            <span
                              key={f}
                              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full max-w-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Risk probability
                    </div>
                    <div className="mt-3">
                      <ProgressBar
                        value={probabilityToPercent(result.risk_assessment?.risk_probability) ?? 0}
                        min={0}
                        max={100}
                      />
                      <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        This is a model estimate, not medical advice.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Risk trend</div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        Last {history.length}/20 runs
                      </div>
                      <button
                        type="button"
                        onClick={() => setHistory([])}
                        className="text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Sparkline values={riskSeries} min={0} max={100} />
                  </div>
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Tracks your last assessments in this browser.
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Vitals trends</div>
                  <div className="mt-4 grid gap-3">
                    <div>
                      <div className="flex items-baseline justify-between text-xs text-zinc-600 dark:text-zinc-300">
                        <span className="font-medium">BMI</span>
                        <span>{Number.isFinite(asNumber(health.bmi, 22)) ? asNumber(health.bmi, 22) : "-"}</span>
                      </div>
                      <div className="mt-2">
                        <Sparkline values={bmiSeries} min={15} max={45} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between text-xs text-zinc-600 dark:text-zinc-300">
                        <span className="font-medium">Blood sugar</span>
                        <span>{asNumber(health.blood_sugar, 7)} mmol/L</span>
                      </div>
                      <div className="mt-2">
                        <Sparkline values={sugarSeries} min={3} max={14} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Out-of-range signals</div>
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Highlights which vitals are outside typical ranges (not medical advice).
                  </div>
                  <div className="mt-4">
                    <HorizontalBars
                      title="Top signals"
                      items={outOfRangeSignals}
                      valueLabel={(v) => `${Math.round(v * 100)}%`}
                      maxItems={6}
                      card={false}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Vitals overview</div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MetricBar label="BMI" value={asNumber(health.bmi, 22)} min={15} max={45} normal={[18.5, 24.9]} />
                    <MetricBar label="Blood sugar" value={asNumber(health.blood_sugar, 7)} unit="mmol/L" min={3} max={14} normal={[4, 7.8]} />
                    <MetricBar label="Systolic BP" value={asNumber(health.systolic_bp, 120)} unit="mmHg" min={80} max={200} normal={[90, 120]} />
                    <MetricBar label="Diastolic BP" value={asNumber(health.diastolic_bp, 80)} unit="mmHg" min={40} max={130} normal={[60, 80]} />
                    <MetricBar label="Heart rate" value={asNumber(health.heart_rate, 75)} unit="bpm" min={40} max={160} normal={[60, 100]} />
                    <MetricBar label="Body temp" value={asNumber(health.body_temp, 98.6)} unit="°F" min={95} max={104} normal={[97, 99.5]} />
                  </div>
                </div>

                <div className="grid gap-4">
                  <SectionCard
                    title="Immediate actions"
                    items={recommendations?.immediate_actions}
                    empty="No urgent actions suggested for this assessment."
                  />
                  <SectionCard
                    title="Lifestyle changes"
                    items={recommendations?.lifestyle_changes}
                    empty="No lifestyle changes provided."
                  />
                  <SectionCard
                    title="Monitoring"
                    items={recommendations?.monitoring_requirements}
                    empty="No extra monitoring requirements listed."
                  />
                  <SectionCard
                    title="Consultations"
                    items={recommendations?.medical_consultations}
                    empty="No specialist consultations suggested."
                  />
                </div>
              </div>

              <details className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Show raw response (debug)
                </summary>
                <pre className="mt-4 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
              Run an assessment to see results.
            </div>
          )}

          {modelInfo ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-base font-semibold">Model performance</div>
              {modelInfo?.error ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {String(modelInfo.error)}
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">Choose model:</div>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700"
                    >
                      {(Array.isArray(modelInfo?.available_models)
                        ? (modelInfo.available_models as string[])
                        : ["random_forest"])?.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    {typeof modelInfo?.model_trained === "boolean" ? (
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                        {modelInfo.model_trained ? "Trained" : "Not trained"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <HorizontalBars
                      title="Feature importance (top)"
                      items={featureImportanceRows}
                      valueLabel={(v) => v.toFixed(3)}
                      maxItems={10}
                    />
                    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Notes</div>
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                        <li>Importance is model-specific and may vary by algorithm.</li>
                        <li>Higher values mean stronger influence in the model.</li>
                      </ul>
                    </div>
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Show raw details
                    </summary>
                    <pre className="mt-3 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100">
                      {JSON.stringify(modelInfo, null, 2)}
                    </pre>
                  </details>
                </>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
