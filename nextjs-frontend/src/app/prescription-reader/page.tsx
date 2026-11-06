"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UploadDropzone } from "@/components/report/UploadDropzone";
import { HandwritingScan } from "@/components/report/HandwritingScan";
import { DietPlanView, ReportView } from "@/components/report/ReportView";
import { AlertIcon, CheckIcon, FileIcon, InfoIcon, ScanIcon, SparkIcon } from "@/components/report/icons";
import {
  friendlyError,
  isEmptyReport,
  normalizeDietPlan,
  normalizeReport,
  type HandwritingApiResponse,
  type OcrResult,
  type PrescriptionApiResponse,
} from "@/lib/report";

type Mode = "full" | "scan";

const STAGES: Record<Mode, Array<{ label: string; at: number }>> = {
  full: [
    { label: "Uploading document", at: 0 },
    { label: "Scanning handwriting", at: 1.5 },
    { label: "Reading medicines & tests", at: 4 },
    { label: "Writing your diet plan", at: 14 },
  ],
  scan: [
    { label: "Uploading", at: 0 },
    { label: "Finding characters", at: 0.8 },
    { label: "Recognising letters", at: 1.6 },
  ],
};

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-emerald-700";

export default function PrescriptionReaderPage() {
  const [mode, setMode] = useState<Mode>("full");
  const [file, setFile] = useState<File | null>(null);
  const [dietaryPreferences, setDietaryPreferences] = useState("");
  const [allergies, setAllergies] = useState("");
  const [goals, setGoals] = useState("");
  const [includeDietPlan, setIncludeDietPlan] = useState(true);

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ report: PrescriptionApiResponse | null; ocr: OcrResult | null } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(id);
  }, [loading]);

  const report = useMemo(() => normalizeReport(result?.report?.extracted), [result]);
  const plan = useMemo(() => normalizeDietPlan(result?.report?.diet_plan), [result]);
  const stages = STAGES[mode];
  const activeStage = stages.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  async function submit() {
    if (!file || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setElapsed(0);
    setError(null);
    setNotice(null);
    setResult(null);

    const form = new FormData();
    form.set("file", file);
    if (mode === "full") {
      form.set("dietary_preferences", dietaryPreferences);
      form.set("allergies", allergies);
      form.set("goals", goals);
      form.set("include_diet_plan", String(includeDietPlan));
    }

    try {
      const res = await fetch(mode === "full" ? "/api/prescription_report" : "/api/ocr_handwriting", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(friendlyError(res.status, text));

      let data: PrescriptionApiResponse | HandwritingApiResponse;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("The server sent an unexpected response. Please try again.");
      }

      if (mode === "full") {
        const full = data as PrescriptionApiResponse;
        setResult({ report: full, ocr: full.ocr ?? null });
        if (!full.success) {
          if (full.ocr) setNotice(`${full.error ?? "AI reading failed."} The handwriting scan is shown below.`);
          else setError(full.error ?? "We couldn't read this document. Try a sharper, well-lit photo.");
        }
      } else {
        const scan = data as HandwritingApiResponse;
        if (!scan.success || !scan.ocr) setError(scan.error ?? "The scanner couldn't process this file.");
        setResult({ report: null, ocr: scan.ocr ?? null });
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(
        e instanceof TypeError
          ? "Couldn't reach the server. Check your connection and try again."
          : e instanceof Error
            ? e.message
            : "Something went wrong.",
      );
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  const hasStructured = !isEmptyReport(report);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-400">Prescription & report reader</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Turn a doctor’s note into a plan you can follow</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Upload a prescription or lab report. We list the medicines and test results, flag anything unclear, and suggest
          pregnancy-friendly meals that fit your doctor’s instructions.
        </p>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* ---------- Input column ---------- */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div role="tablist" aria-label="Reading mode" className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
            {([
              ["full", "Full report", <SparkIcon key="i" size={15} />],
              ["scan", "Handwriting scan", <ScanIcon key="i" size={15} />],
            ] as const).map(([value, label, icon]) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                disabled={loading}
                onClick={() => setMode(value)}
                className={[
                  "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                  mode === value
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                ].join(" ")}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <p className="px-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {mode === "full"
              ? "AI reads printed and handwritten documents, then builds a diet plan. Takes about 10–30 seconds."
              : "Instant on-server scan for writing in separate BLOCK CAPITALS and numbers. Joined-up handwriting needs Full report."}
          </p>

          <UploadDropzone
            file={file}
            disabled={loading}
            onFile={(f, err) => {
              setFile(f);
              setError(err ?? null);
              setResult(null);
              setNotice(null);
            }}
          />

          {mode === "full" ? (
            <details className="group rounded-2xl border border-zinc-200 bg-white open:pb-4 dark:border-zinc-800 dark:bg-zinc-950">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
                Personalise the diet plan
                <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-3 px-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Food preferences</span>
                  <input className={inputClass} value={dietaryPreferences} onChange={(e) => setDietaryPreferences(e.target.value)} placeholder="vegetarian, low salt" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Allergies</span>
                  <input className={inputClass} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="peanuts, lactose" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Goals</span>
                  <input className={inputClass} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="raise iron levels" />
                </label>
                <label className="flex items-center gap-2.5 pt-1 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={includeDietPlan} onChange={(e) => setIncludeDietPlan(e.target.checked)} />
                  Include a diet plan
                </label>
              </div>
            </details>
          ) : null}

          <button
            onClick={submit}
            disabled={!file || loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white dark:border-zinc-900/30 dark:border-t-zinc-900" />
                Reading… {Math.floor(elapsed)}s
              </>
            ) : mode === "full" ? (
              "Read my report"
            ) : (
              "Scan handwriting"
            )}
          </button>

          {loading ? (
            <ol className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" aria-live="polite">
              {stages.map((s, i) => (
                <li key={s.label} className="flex items-center gap-3 text-sm">
                  <span
                    className={[
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                      i < activeStage
                        ? "bg-emerald-500 text-white"
                        : i === activeStage
                          ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400/50 dark:bg-emerald-950"
                          : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800",
                    ].join(" ")}
                  >
                    {i < activeStage ? <CheckIcon size={11} /> : i + 1}
                  </span>
                  <span className={i <= activeStage ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}>{s.label}</span>
                  {i === activeStage ? <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </aside>

        {/* ---------- Results column ---------- */}
        <div className="min-w-0 space-y-4">
          {error ? (
            <div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              <AlertIcon size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {notice ? (
            <div className="flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">
              <InfoIcon size={18} className="mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}

          {!result && !loading && !error ? <EmptyState /> : null}
          {loading && !result ? <Skeleton /> : null}

          {result ? (
            <>
              {hasStructured && report ? <ReportView report={report} /> : null}
              {result.report?.success && !hasStructured ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  No medicines or test results were found in this document.
                </div>
              ) : null}
              {plan ? <DietPlanView plan={plan} /> : null}
              {result.ocr ? <HandwritingScan ocr={result.ocr} /> : null}
              <p className="px-1 text-xs leading-5 text-zinc-500">
                This tool explains documents; it does not replace your clinician. Never change a dose based on this summary.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const tips = [
    ["Flat and well lit", "Lay the page on a table near a window. Avoid shadows across the writing."],
    ["Fill the frame", "Get close enough that the writing covers most of the photo."],
    ["One page at a time", "For PDFs, the first page is scanned for handwriting."],
  ];
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <FileIcon size={20} />
        </span>
        <div>
          <div className="font-semibold">Your report will appear here</div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Medicines, test results and a diet plan, side by side.</div>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {tips.map(([title, body], i) => (
          <div key={title} className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/60">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Tip {i + 1}</div>
            <div className="mt-1 text-sm font-medium">{title}</div>
            <div className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-28 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      </div>
      <div className="h-48 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}
