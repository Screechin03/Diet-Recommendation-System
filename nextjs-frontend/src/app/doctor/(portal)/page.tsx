"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLiveData } from "@/components/care/hooks";
import { AlertIcon, ChatIcon, CheckIcon, UserIcon } from "@/components/report/icons";
import { Avatar, buttonClass, Card, ClockIcon, CountBadge, InboxIcon, KindIcon, Notice, Pill, Spinner, UsersIcon } from "@/components/care/ui";
import {
  careErrorMessage,
  doctorInbox,
  doctorName,
  doctorPatients,
  formatDateTime,
  KIND_COPY,
  timeAgo,
  type DoctorPatientRow,
  type InboxItem,
} from "@/lib/care";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function itemHref(i: InboxItem): string {
  const base = `/doctor/patients/${i.patient_id}`;
  if (i.record_id) return `${base}/records/${i.record_id}`;
  if (i.item_type === "message") return `${base}?tab=messages`;
  return base;
}

const ITEM_STYLE: Record<InboxItem["item_type"], { icon: ReactNode; cls: string }> = {
  urgent: { icon: <AlertIcon size={18} />, cls: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300" },
  review: { icon: <ClockIcon size={18} />, cls: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  message: { icon: <ChatIcon size={18} />, cls: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  new_patient: { icon: <UserIcon size={18} />, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
};

function itemTitle(i: InboxItem): string {
  switch (i.item_type) {
    case "urgent":
      return `Urgent: ${i.record_title ?? "result"}`;
    case "review":
      return `Review requested: ${i.record_title ?? "record"}`;
    case "message":
      return `${i.item_count} new message${i.item_count === 1 ? "" : "s"}${i.record_title ? ` on “${i.record_title}”` : ""}`;
    default:
      return "New patient chose you";
  }
}

export default function DoctorInboxPage() {
  const { account } = useAuth();
  const [inbox, setInbox] = useState<InboxItem[] | null>(null);
  const [patients, setPatients] = useState<DoctorPatientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, p] = await Promise.all([doctorInbox(), doctorPatients()]);
      setInbox(i);
      setPatients(p);
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load your inbox."));
    }
  }, []);

  useLiveData(load, 20_000);

  const active = (patients ?? []).filter((p) => p.status === "active");
  const stats = [
    { label: "Current patients", value: active.length, icon: <UsersIcon size={18} />, tone: "text-zinc-500" },
    { label: "Awaiting review", value: active.reduce((n, p) => n + p.pending_reviews, 0), icon: <ClockIcon size={18} />, tone: "text-sky-600" },
    { label: "Urgent", value: active.reduce((n, p) => n + p.urgent_pending, 0), icon: <AlertIcon size={18} />, tone: "text-rose-600" },
    { label: "Unread messages", value: active.reduce((n, p) => n + p.unread_messages, 0), icon: <ChatIcon size={18} />, tone: "text-violet-600" },
  ];
  const doctor = account?.doctor;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700 dark:text-sky-400">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{greeting()}, {doctorName(doctor?.full_name)}</h1>
        </div>
        {doctor ? (
          <Link href="/doctor/profile" className="text-sm">
            {doctor.accepting_patients ? <Pill tone="green" dot>Accepting new patients</Pill> : <Pill tone="amber" dot>Not accepting new patients</Pill>}
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className={`flex items-center gap-2 text-xs font-medium ${s.tone}`}>{s.icon}<span className="text-zinc-500">{s.label}</span></div>
            <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{patients ? s.value : "–"}</div>
          </Card>
        ))}
      </div>

      {error ? <div className="mt-6"><Notice tone="red">{error}</Notice></div> : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <h2 className="flex items-center gap-2 font-semibold"><InboxIcon size={18} /> Needs your attention <CountBadge n={inbox?.length ?? 0} tone="blue" /></h2>
            <span className="text-xs text-zinc-500">Updates automatically</span>
          </div>
          {inbox === null ? (
            <div className="flex items-center gap-2 p-6 text-sm text-zinc-500"><Spinner /> Loading…</div>
          ) : !inbox.length ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50"><CheckIcon size={22} /></span>
              <div className="mt-3 font-semibold">You’re all caught up</div>
              <p className="mt-1 max-w-sm text-sm text-zinc-500">
                {active.length
                  ? "New review requests, urgent results and messages from your patients will appear here."
                  : "When a patient chooses you as their doctor, they’ll appear here. Patients find you by name, hospital and city."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {inbox.map((i, idx) => {
                const st = ITEM_STYLE[i.item_type];
                return (
                  <li key={`${i.item_type}-${i.patient_id}-${i.record_id ?? "g"}-${idx}`}>
                    <Link href={itemHref(i)} className="flex gap-3 px-5 py-4 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${st.cls}`}>{st.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="truncate text-sm font-semibold">{itemTitle(i)}</span>
                          <span className="shrink-0 text-xs text-zinc-500" title={formatDateTime(i.at)}>{timeAgo(i.at)}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">{i.patient_name}</span>
                          {i.record_kind ? <span>· {KIND_COPY[i.record_kind].label}</span> : null}
                        </div>
                        {i.preview ? <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">“{i.preview}”</p> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <aside className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Your patients</h2>
              <Link href="/doctor/patients" className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400">See all</Link>
            </div>
            {patients === null ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Loading…</div>
            ) : !active.length ? (
              <p className="mt-3 text-sm text-zinc-500">No patients yet.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {active.slice(0, 8).map((p) => {
                  const n = p.pending_reviews + p.unread_messages;
                  return (
                    <li key={p.patient_id}>
                      <Link href={`/doctor/patients/${p.patient_id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <Avatar name={p.patient_name} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                            {p.patient_name} {p.is_new ? <Pill tone="green">New</Pill> : null}
                          </div>
                          <div className="truncate text-xs text-zinc-500">
                            {p.pregnancy_month ? `Month ${p.pregnancy_month}` : "Month not set"} · {timeAgo(p.last_activity)}
                          </div>
                        </div>
                        {p.urgent_pending ? <span className="h-2 w-2 rounded-full bg-rose-500" title="Urgent result" /> : null}
                        <CountBadge n={n} tone="blue" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="p-5 text-sm">
            <div className="flex items-center gap-2 font-semibold"><KindIcon kind="report" size={28} /> How patients reach you</div>
            <p className="mt-2 leading-6 text-zinc-600 dark:text-zinc-400">
              Patients choose you under <b>My care → Find a doctor</b>. Their saved records then appear here automatically.
            </p>
            <Link href="/doctor/profile" className={`${buttonClass("secondary", "sm")} mt-3`}>Edit your public profile</Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
