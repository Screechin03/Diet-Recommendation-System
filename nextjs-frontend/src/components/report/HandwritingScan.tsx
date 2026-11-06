"use client";

import { useEffect, useState } from "react";
import { QUALITY_LABEL, type OcrResult } from "@/lib/report";
import { AlertIcon, CheckIcon, CopyIcon, ExpandIcon, InfoIcon, ScanIcon, XIcon } from "./icons";

const TONE = {
  clear: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  partial: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  unreadable: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  no_text: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
} as const;

function confidenceColor(c: number) {
  if (c >= 0.85) return "bg-emerald-500";
  if (c >= 0.6) return "bg-amber-500";
  return "bg-rose-500";
}

export function HandwritingScan({ ocr, compact }: { ocr: OcrResult; compact?: boolean }) {
  const [zoom, setZoom] = useState(false);
  const [copied, setCopied] = useState(false);
  const pct = Math.round(ocr.avg_confidence * 100);
  const readable = ocr.quality === "clear" || ocr.quality === "partial";

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(ocr.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (e.g. insecure context): ignore
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800/70">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
            <ScanIcon size={16} />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Handwriting scan</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">On-device model · block capitals & digits</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${TONE[ocr.quality]}`}>
          {ocr.quality === "clear" ? <CheckIcon size={14} /> : ocr.quality === "partial" ? <AlertIcon size={14} /> : <InfoIcon size={14} />}
          {QUALITY_LABEL[ocr.quality]}
        </span>
      </header>

      <div className={compact ? "grid gap-0" : "grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"}>
        {ocr.annotated_image ? (
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="group relative block bg-zinc-100 dark:bg-zinc-900"
            aria-label="Enlarge scanned image"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
            <img src={ocr.annotated_image} alt="Document with detected characters outlined" className="max-h-80 w-full object-contain" />
            <span className="absolute right-3 top-3 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
              <ExpandIcon size={14} />
            </span>
          </button>
        ) : null}

        <div className="flex flex-col gap-4 p-5">
          <div>
            <div className="flex items-baseline justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>Average confidence</span>
              <span className="font-mono text-sm text-zinc-900 dark:text-zinc-100">{pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className={`h-full rounded-full ${confidenceColor(ocr.avg_confidence)}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {ocr.character_count} character{ocr.character_count === 1 ? "" : "s"} detected
            </p>
          </div>

          {readable ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Recognised text</span>
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="space-y-1 rounded-xl bg-zinc-50 p-3 font-mono text-sm dark:bg-zinc-900">
                {ocr.lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex-1 break-all">{line.text}</span>
                    <span className="shrink-0 text-[11px] text-zinc-400">{Math.round(line.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{ocr.message}</p>

          {ocr.annotated_image ? (
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-emerald-500" />Confident</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-amber-500" />Unsure</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-rose-500" />Likely wrong</span>
            </div>
          ) : null}
        </div>
      </div>

      {zoom && ocr.annotated_image ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scanned image"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the API */}
          <img src={ocr.annotated_image} alt="Document with detected characters outlined" className="max-h-full max-w-full rounded-lg" />
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setZoom(false)}
          >
            <XIcon />
          </button>
        </div>
      ) : null}
    </section>
  );
}
