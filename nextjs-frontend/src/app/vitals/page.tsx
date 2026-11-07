"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { FileIcon, ScanIcon, SparkIcon, UploadIcon, XIcon } from "@/components/report/icons";
import { LiveMonitor } from "@/components/vitals/LiveMonitor";
import { VitalsResults } from "@/components/vitals/VitalsResults";
import { formatBytes } from "@/lib/report";
import { deleteVitalSession, getVitalSessions, saveVitalSession, type VitalSessionRow } from "@/lib/supabaseUserData";
import { STATUS_COPY, formatDuration, type VitalsAnalysis } from "@/lib/vitals";

type SourceKind = "usb" | "file" | "demo";

const SCENARIOS = [
  ["normal", "Healthy readings"],
  ["tachycardia", "High heart rate"],
  ["low_spo2", "Low blood oxygen"],
  ["fever", "Fever"],
  ["irregular", "Irregular heartbeat"],
  ["leads_off", "Loose ECG electrode"],
] as const;

const DOT = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500", gray: "bg-zinc-400" } as const;
const selectCls =
  "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-950";

export default function VitalsPage() {
  const { user } = useAuth();
  const [source, setSource] = useState<SourceKind>("usb");
  const [scenario, setScenario] = useState("normal");
  const [pregnancyMonth, setPregnancyMonth] = useState<number | null>(null);
  const [activity, setActivity] = useState<"rest" | "exercise">("rest");

  const [result, setResult] = useState<VitalsAnalysis | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [history, setHistory] = useState<VitalSessionRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    try {
      setHistory(await getVitalSessions(user.id));
      setHistoryError(null);
    } catch {
      setHistoryError("Couldn't load your saved sessions.");
    }
  }, [user]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function showResult(a: VitalsAnalysis, id: string | null = null) {
    setResult(a);
    setSavedId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function importFile() {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (pregnancyMonth) form.set("pregnancy_month", String(pregnancyMonth));
      form.set("activity", activity);
      const res = await fetch("/api/vitals/analyze_file", { method: "POST", body: form });
      const text = await res.text();
      if (!res.ok) {
        let detail = "";
        try {
          const j = JSON.parse(text) as { detail?: string; error?: string };
          detail = j.detail ?? j.error ?? "";
        } catch {
          detail = "";
        }
        throw new Error(res.status === 413 ? "That file is too large (the limit is 30 minutes of recording)." : detail || "The file couldn't be analysed.");
      }
      showResult(JSON.parse(text) as VitalsAnalysis);
    } catch (e) {
      setImportError(e instanceof TypeError ? "Couldn't reach the server. Check your connection." : e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    if (!user || !result) return;
    setSaving(true);
    try {
      setSavedId(await saveVitalSession(user.id, result));
      void loadHistory();
    } catch {
      setImportError("Couldn't save this session. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!user) return;
    try {
      await deleteVitalSession(user.id, id);
      setHistory((h) => h?.filter((r) => r.id !== id) ?? null);
      if (savedId === id) setSavedId(null);
    } catch {
      setHistoryError("Couldn't delete that session.");
    }
  }

  const sources: Array<{ kind: SourceKind; title: string; desc: string; icon: ReactNode }> = [
    { kind: "usb", title: "USB cable (live)", desc: "Chrome or Edge on a computer", icon: <ScanIcon size={18} /> },
    { kind: "file", title: "SD-card file", desc: "Import the .jsonl file from the device", icon: <FileIcon size={18} /> },
    { kind: "demo", title: "Try a sample", desc: "Simulated readings, no device needed", icon: <SparkIcon size={18} /> },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-400">Home monitoring</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Your vital signs, explained</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Connect the MamaCare device to measure heart rate, blood oxygen, temperature and a one-lead ECG. We check the readings
          against pregnancy ranges and create a report you can share with your doctor.
        </p>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div role="radiogroup" aria-label="How to read your vitals" className="space-y-2">
            {sources.map((s) => (
              <button
                key={s.kind}
                role="radio"
                aria-checked={source === s.kind}
                onClick={() => {
                  setSource(s.kind);
                  setResult(null);
                }}
                className={[
                  "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition",
                  source === s.kind
                    ? "border-emerald-400 bg-emerald-50/70 ring-4 ring-emerald-500/10 dark:border-emerald-700 dark:bg-emerald-950/30"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700",
                ].join(" ")}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${source === s.kind ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>
                  {s.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{s.title}</span>
                  <span className="block text-xs text-zinc-500">{s.desc}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            {source === "demo" ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Sample to play</span>
                <select className={selectCls} value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  {SCENARIOS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Month of pregnancy</span>
              <select className={selectCls} value={pregnancyMonth ?? ""} onChange={(e) => setPregnancyMonth(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Not set</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => (
                  <option key={m} value={m}>Month {m}</option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">When measured</span>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
                {(["rest", "exercise"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setActivity(a)}
                    className={`rounded-lg py-1.5 text-sm font-medium ${activity === a ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}
                  >
                    {a === "rest" ? "At rest" : "After exercise"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          {result ? (
            <VitalsResults
              analysis={result}
              onSave={user ? save : undefined}
              saved={savedId !== null}
              saving={saving}
              onNew={() => setResult(null)}
            />
          ) : null}

          <div className={result ? "hidden" : ""}>
            {source === "file" ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="text-base font-semibold">Import a recording from the SD card</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  Put the device’s SD card in your computer and choose the session file (named like <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">SESSION_20261106_0930.jsonl</code>).
                </p>
                {file ? (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                    <FileIcon size={22} className="text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{file.name}</div>
                      <div className="text-xs text-zinc-500">{formatBytes(file.size)}</div>
                    </div>
                    <button onClick={() => setFile(null)} aria-label="Remove file" className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                      <XIcon size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="mt-4 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-zinc-300 px-6 py-8 text-center hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-zinc-700 dark:hover:bg-emerald-950/20">
                    <UploadIcon size={22} className="text-emerald-600" />
                    <span className="mt-2 text-sm font-semibold">Choose a session file</span>
                    <span className="text-xs text-zinc-500">.jsonl or .txt, up to 30 minutes</span>
                    <input
                      type="file"
                      accept=".jsonl,.txt,.json,application/json,text/plain"
                      hidden
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setImportError(null);
                      }}
                    />
                  </label>
                )}
                {importError ? <div role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{importError}</div> : null}
                <button
                  onClick={importFile}
                  disabled={!file || importing}
                  className="mt-4 h-11 rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                >
                  {importing ? "Analysing…" : "Analyse recording"}
                </button>
              </div>
            ) : (
              <LiveMonitor
                key={source === "demo" ? `demo-${scenario}` : "usb"}
                source={source === "demo" ? { kind: "demo", scenario } : { kind: "usb" }}
                pregnancyMonth={pregnancyMonth}
                activity={activity}
                onResult={(a) => showResult(a)}
              />
            )}
          </div>

          {user ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold">Your saved sessions</h3>
              {historyError ? <p className="text-sm text-rose-600">{historyError}</p> : null}
              {history && !history.length ? (
                <p className="rounded-2xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-500 dark:border-zinc-800">
                  No saved sessions yet. After a measurement, choose “Save to my history”.
                </p>
              ) : null}
              <ul className="space-y-2">
                {history?.map((row) => {
                  const copy = STATUS_COPY[row.status as keyof typeof STATUS_COPY] ?? STATUS_COPY.insufficient;
                  return (
                    <li key={row.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[copy.tone]}`} />
                      <button onClick={() => showResult(row.analysis, row.id)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-medium">{row.headline}</div>
                        <div className="text-xs text-zinc-500">
                          {new Date(row.created_at).toLocaleString()} · {formatDuration(row.duration_s)} min
                          {row.analysis?.demo ? " · sample data" : ""}
                        </div>
                      </button>
                      <button onClick={() => void remove(row.id)} aria-label="Delete session" className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-800">
                        <XIcon size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
