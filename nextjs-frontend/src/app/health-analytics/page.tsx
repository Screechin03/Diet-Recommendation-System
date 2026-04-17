"use client";

import { useState } from "react";
import type { HealthAnalyticsInput, RiskPredictionOut } from "@/lib/types";
import { safeJson } from "@/lib/utils";

const inputClass =
  "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";

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
  const [modelInfo, setModelInfo] = useState<any>(null);
  const [useGemini, setUseGemini] = useState<boolean>(false);
  const [refined, setRefined] = useState<any>(null);

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
          const refineJson = await refineRes.json();
          setRefined(refineJson.refined);
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
      setModelInfo(await res.json());
    } catch (e) {
      setModelInfo({ error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

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
                  {refined.bullets.slice(0, 10).map((b: any, idx: number) => (
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
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-base font-semibold">Risk assessment</div>
                {result.risk_assessment?.risk_level ? (
                  <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {String(result.risk_assessment.risk_level)}
                  </div>
                ) : null}
                {typeof result.risk_assessment?.risk_probability === "number" ? (
                  <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {Math.round(result.risk_assessment.risk_probability * 100)}%
                  </div>
                ) : null}
              </div>

              <pre className="mt-4 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
              Run an assessment to see results.
            </div>
          )}

          {modelInfo ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-base font-semibold">Model performance</div>
              <pre className="mt-4 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100">
                {JSON.stringify(modelInfo, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
