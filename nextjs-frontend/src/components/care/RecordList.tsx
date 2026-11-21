"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChatIcon } from "@/components/report/icons";
import { EmptyState, KindIcon, Pill, ReviewPill, SeverityPill } from "@/components/care/ui";
import { KIND_COPY, timeAgo, formatDateTime, type RecordKind, type RecordSummary } from "@/lib/care";

const FILTERS: Array<{ value: RecordKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "report", label: "Reports" },
  { value: "vitals", label: "Vital signs" },
  { value: "risk", label: "Risk checks" },
  { value: "diet_plan", label: "Diet plans" },
  { value: "med_check", label: "Medicines" },
];

export function RecordList({
  records,
  hrefFor,
  unread = {},
  doctorView = false,
  empty,
}: {
  records: RecordSummary[];
  hrefFor: (r: RecordSummary) => string;
  unread?: Record<string, number>;
  doctorView?: boolean;
  empty: ReactNode;
}) {
  const [filter, setFilter] = useState<RecordKind | "all">("all");
  const counts = records.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {});
  const shown = filter === "all" ? records : records.filter((r) => r.kind === filter);
  const accent = doctorView ? "bg-sky-600 text-white" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900";

  return (
    <div>
      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Record type">
        {FILTERS.map((f) => {
          const n = f.value === "all" ? records.length : counts[f.value] ?? 0;
          if (f.value !== "all" && !n) return null;
          const on = filter === f.value;
          return (
            <button
              key={f.value}
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f.value)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                on ? accent : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {f.label} <span className={on ? "opacity-70" : "text-zinc-400"}>{n}</span>
            </button>
          );
        })}
      </div>

      {!shown.length ? (
        typeof empty === "string" ? <EmptyState title={empty} /> : empty
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-900 dark:border-zinc-800 dark:bg-zinc-950">
          {shown.map((r) => {
            const n = unread[r.id] ?? 0;
            return (
              <li key={r.id}>
                <Link href={hrefFor(r)} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                  <KindIcon kind={r.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-semibold">{r.title}</span>
                      {r.severity === "urgent" || r.severity === "attention" ? <SeverityPill severity={r.severity} /> : null}
                      <ReviewPill record={r} doctorView={doctorView} />
                      {r.is_sample ? <Pill>Sample data</Pill> : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500">
                      <span title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</span>
                      {" · "}
                      {KIND_COPY[r.kind].label}
                      {r.summary ? ` · ${r.summary}` : ""}
                    </div>
                  </div>
                  {n ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      <ChatIcon size={12} /> {n}
                    </span>
                  ) : null}
                  <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
