"use client";

import { useMemo, useState } from "react";
import { safeJson } from "@/lib/utils";

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";
const textAreaClass =
  "min-h-24 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";

type PrescriptionReport = {
  success: boolean;
  file: { filename: string; mime_type: string; size_bytes: number };
  extracted?: any;
  diet_plan?: any;
  error?: string | null;
};

export default function PrescriptionReaderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dietaryPreferences, setDietaryPreferences] = useState<string>("");
  const [allergies, setAllergies] = useState<string>("");
  const [goals, setGoals] = useState<string>("");
  const [includeDietPlan, setIncludeDietPlan] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PrescriptionReport | null>(null);

  const canSubmit = useMemo(() => !!file && !loading, [file, loading]);

  async function submit() {
    if (!file) return;

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const form = new FormData();
      form.set("file", file);
      form.set("dietary_preferences", dietaryPreferences);
      form.set("allergies", allergies);
      form.set("goals", goals);
      form.set("include_diet_plan", String(includeDietPlan));

      const res = await fetch("/api/prescription_report", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = await safeJson<PrescriptionReport>(res);
      setReport(data);

      if (!data.success) {
        setError(data.error || "Extraction failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prescription Reader</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            Upload a prescription or lab report (PDF/photo). Gemini will extract readable details into a structured report,
            then generate a conservative diet-plan summary.
          </p>
        </div>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {loading ? "Processing…" : "Generate Report"}
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-5">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Upload PDF / photo</span>
              <input
                className={inputClass}
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className="text-xs text-zinc-500">
                Supported: PDF, PNG/JPG. Handwritten notes work best with clear photos.
              </span>
            </label>

            <div className="grid gap-3">
              <div className="text-sm font-semibold">Optional preferences</div>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Dietary preferences (comma/newline separated)</span>
                <textarea
                  className={textAreaClass}
                  value={dietaryPreferences}
                  onChange={(e) => setDietaryPreferences(e.target.value)}
                  placeholder="e.g. vegetarian, low sodium"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Allergies (comma/newline separated)</span>
                <textarea
                  className={textAreaClass}
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="e.g. peanuts, lactose"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Goals (comma/newline separated)</span>
                <textarea
                  className={textAreaClass}
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  placeholder="e.g. weight gain, improve iron intake"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={includeDietPlan}
                  onChange={(e) => setIncludeDietPlan(e.target.checked)}
                />
                Generate diet plan summary
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}

          {!report ? (
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              Upload a file and click “Generate Report”.
            </div>
          ) : (
            <div className="grid gap-6">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                <div className="font-semibold">File</div>
                <div className="mt-1">
                  {report.file.filename} • {report.file.mime_type} • {report.file.size_bytes} bytes
                </div>
              </div>

              <div>
                <h2 className="text-base font-semibold">Extracted report</h2>
                <pre className="mt-2 max-h-90 overflow-auto rounded-xl border border-zinc-200 bg-white p-4 text-xs dark:border-zinc-800 dark:bg-zinc-950">
                  {JSON.stringify(report.extracted ?? null, null, 2)}
                </pre>
              </div>

              <div>
                <h2 className="text-base font-semibold">Diet plan</h2>
                <pre className="mt-2 max-h-90 overflow-auto rounded-xl border border-zinc-200 bg-white p-4 text-xs dark:border-zinc-800 dark:bg-zinc-950">
                  {JSON.stringify(report.diet_plan ?? null, null, 2)}
                </pre>
              </div>

              <div className="text-xs text-zinc-500">
                This is not medical advice. Always follow your clinician’s instructions.
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
