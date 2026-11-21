"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useLiveData } from "@/components/care/hooks";
import { Avatar, Card, EmptyState, doctorInputClass, Notice, Pill, SearchIcon, Spinner, UsersIcon } from "@/components/care/ui";
import { careErrorMessage, doctorPatients, formatDateTime, SEVERITY_COPY, timeAgo, type DoctorPatientRow } from "@/lib/care";

const DOT = { green: "bg-emerald-500", gray: "bg-zinc-400", amber: "bg-amber-500", red: "bg-rose-500" } as const;

export default function DoctorPatientsPage() {
  const [rows, setRows] = useState<DoctorPatientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"active" | "ended">("active");

  const load = useCallback(async () => {
    try {
      setRows(await doctorPatients());
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load your patients."));
    }
  }, []);
  useLiveData(load, 30_000);

  const counts = { active: rows?.filter((r) => r.status === "active").length ?? 0, ended: rows?.filter((r) => r.status === "ended").length ?? 0 };
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => r.status === view && (!q || r.patient_name.toLowerCase().includes(q)));
  }, [rows, query, view]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Patients</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Patients who chose you as their doctor. You see their records while they stay connected.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-sm dark:bg-zinc-900" role="tablist">
            {(["active", "ended"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1.5 font-medium ${view === v ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500"}`}
              >
                {v === "active" ? "Current" : "Past"} <span className="text-zinc-400">{counts[v]}</span>
              </button>
            ))}
          </div>
          <div className="relative w-64 max-w-full">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400"><SearchIcon size={15} /></span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patients" aria-label="Search patients" className={`${doctorInputClass} h-10 py-2 pl-9`} />
          </div>
        </div>
      </div>

      <div className="mt-6">
        {error ? <Notice tone="red">{error}</Notice> : null}
        {rows === null && !error ? <div className="flex items-center gap-2 py-10 text-sm text-zinc-500"><Spinner /> Loading patients…</div> : null}
        {rows && !shown.length ? (
          <EmptyState
            icon={<UsersIcon size={28} />}
            title={query ? "No patients match your search" : view === "active" ? "No current patients" : "No past patients"}
            text={view === "active" && !query ? "When a patient chooses you under My care → Find a doctor, she appears here." : undefined}
          />
        ) : null}
        {shown.length ? (
          <Card className="overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,2fr)_110px] gap-4 border-b border-zinc-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 md:grid">
              <span>Patient</span><span>Needs attention</span><span>Latest record</span><span className="text-right">Last activity</span>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {shown.map((p) => (
                <li key={p.patient_id}>
                  <Link
                    href={`/doctor/patients/${p.patient_id}`}
                    className="grid gap-3 px-5 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,2fr)_110px] md:items-center md:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={p.patient_name} size={38} tone={p.status === "active" ? "green" : "gray"} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{p.patient_name}</div>
                        <div className="text-xs text-zinc-500">
                          {p.status === "active"
                            ? `${p.pregnancy_month ? `Month ${p.pregnancy_month}` : "Month not set"} · ${p.records_count} record${p.records_count === 1 ? "" : "s"}`
                            : `Ended ${p.ended_at ? new Date(p.ended_at).toLocaleDateString() : ""}${p.ended_by ? ` by ${p.ended_by === "doctor" ? "you" : "patient"}` : ""}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.is_new ? <Pill tone="green" dot>New patient</Pill> : null}
                      {p.urgent_pending ? <Pill tone="red" dot>{p.urgent_pending} urgent</Pill> : null}
                      {p.pending_reviews - p.urgent_pending > 0 ? <Pill tone="blue">{p.pending_reviews - p.urgent_pending} to review</Pill> : null}
                      {p.unread_messages ? <Pill tone="violet">{p.unread_messages} unread</Pill> : null}
                      {p.status === "active" && !p.is_new && !p.pending_reviews && !p.unread_messages ? <span className="text-xs text-zinc-400">Nothing pending</span> : null}
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      {p.last_record_title ? (
                        <>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[SEVERITY_COPY[p.last_record_severity ?? "info"].tone]}`} />
                          <span className="truncate">{p.last_record_title}</span>
                        </>
                      ) : (
                        <span className="text-xs text-zinc-400">{p.status === "active" ? "No records yet" : "No longer shared"}</span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 md:text-right" title={formatDateTime(p.last_activity)}>{timeAgo(p.last_activity)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
