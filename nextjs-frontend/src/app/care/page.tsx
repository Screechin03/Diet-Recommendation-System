"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCareLinks, useLiveData } from "@/components/care/hooks";
import { RecordList } from "@/components/care/RecordList";
import { RequireRole } from "@/components/care/RequireRole";
import { DietSummary } from "@/components/care/DietSummary";
import { Thread } from "@/components/care/Thread";
import {
  Avatar,
  Button,
  buttonClass,
  Card,
  EmptyState,
  HeartPulseIcon,
  inputClass,
  Notice,
  ShieldIcon,
  Spinner,
  StethoscopeBadge,
} from "@/components/care/ui";
import { FileIcon, SparkIcon } from "@/components/report/icons";
import {
  careErrorMessage,
  doctorName,
  endCare,
  getDietInstructions,
  hasDietInstructions,
  listRecords,
  patientUnread,
  type CareLink,
  type DietInstructions,
  type RecordSummary,
} from "@/lib/care";

export default function CarePage() {
  return (
    <RequireRole role="patient">
      <CareHome />
    </RequireRole>
  );
}

const TOOLS = [
  { href: "/prescription-reader", label: "Scan a report", icon: <FileIcon size={16} /> },
  { href: "/vitals", label: "Measure vitals", icon: <HeartPulseIcon size={16} /> },
  { href: "/health-analytics", label: "Risk check", icon: <ShieldIcon size={16} /> },
  { href: "/diet-planner", label: "Diet plan", icon: <SparkIcon size={16} /> },
];

function CareHome() {
  const { user, account } = useAuth();
  const uid = user!.id;
  const { links, active, loading: linksLoading } = useCareLinks();
  const [records, setRecords] = useState<RecordSummary[] | null>(null);
  const [unread, setUnread] = useState<{ total: number; byRecord: Record<string, number> }>({ total: 0, byRecord: {} });
  const [diet, setDiet] = useState<DietInstructions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, u, d] = await Promise.all([listRecords(uid), patientUnread(uid), getDietInstructions(uid)]);
      setRecords(r);
      setUnread(u);
      setDiet(d);
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load your records."));
    }
  }, [uid]);

  useLiveData(load);

  const firstName = (account?.patient?.full_name ?? "").split(" ")[0];
  const past = (links ?? []).filter((l) => l.status === "ended");
  const reviewedUnread = Object.entries(unread.byRecord).filter(([k]) => k !== "general").length;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-400">My care</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{firstName ? `Hi ${firstName}` : "Your health records"}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {active?.doctor
              ? `Everything you save here is shared with ${doctorName(active.doctor.full_name)}, who can review it and reply.`
              : "Your saved reports, vital signs, risk checks and diet plans. Choose a doctor to share them."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className={buttonClass("secondary", "sm")}>
              <span className="text-emerald-600">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {error ? <Notice tone="red">{error}</Notice> : null}
          {reviewedUnread ? (
            <Notice tone="blue" title={`New from ${doctorName(active?.doctor?.full_name)}`}>
              {reviewedUnread === 1 ? "One of your records has a new review or comment." : `${reviewedUnread} of your records have new reviews or comments.`} They’re marked below.
            </Notice>
          ) : null}
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Your records</h2>
            {records ? <span className="text-xs text-zinc-500">{records.length} saved</span> : null}
          </div>
          {records === null ? (
            <div className="flex items-center gap-2 py-10 text-sm text-zinc-500"><Spinner /> Loading your records…</div>
          ) : (
            <RecordList
              records={records}
              unread={unread.byRecord}
              hrefFor={(r) => `/care/records/${r.id}`}
              empty={
                <EmptyState
                  icon={<FileIcon size={28} />}
                  title="No records yet"
                  text="Scan a report, measure your vital signs, run a risk check or make a diet plan, then choose “Save”. It will appear here."
                  action={<Link href="/prescription-reader" className={buttonClass("emerald", "sm")}>Scan a report</Link>}
                />
              }
            />
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          {linksLoading ? (
            <Card className="flex items-center gap-2 p-5 text-sm text-zinc-500"><Spinner /> Loading…</Card>
          ) : active?.doctor ? (
            <DoctorCard link={active} />
          ) : (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <StethoscopeBadge />
                <div>
                  <h3 className="font-semibold">Choose your doctor</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    Your doctor sees your records as soon as you save them, reviews them and can message you. You can change doctor at any time.
                  </p>
                </div>
              </div>
              <Link href="/care/doctors" className={`${buttonClass("emerald")} mt-4 w-full`}>Find a doctor</Link>
            </Card>
          )}

          {active?.doctor ? (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Messages with {doctorName(active.doctor.full_name)}</h3>
              <Thread
                patientId={uid}
                canWrite
                placeholder="Ask a question or share an update…"
                emptyText="No messages yet. Say hello or ask a question."
                maxHeight={340}
              />
            </Card>
          ) : null}

          {hasDietInstructions(diet) ? (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Diet instructions from {doctorName(diet.updated_by_name)}</h3>
              <DietSummary d={diet} />
              <Link href="/diet-planner" className={`${buttonClass("secondary", "sm")} mt-4`}>Open the diet planner</Link>
              <p className="mt-2 text-xs text-zinc-500">The diet planner applies these automatically.</p>
            </Card>
          ) : null}

          {past.length ? (
            <Card className="p-5">
              <h3 className="text-sm font-semibold">Previous doctors</h3>
              <ul className="mt-3 space-y-3">
                {past.map((l) => (
                  <li key={l.id} className="flex gap-3 text-sm">
                    <Avatar name={l.doctor?.full_name} size={32} tone="gray" />
                    <div className="min-w-0">
                      <div className="font-medium">{doctorName(l.doctor?.full_name)}</div>
                      <div className="text-xs text-zinc-500">
                        {new Date(l.started_at).toLocaleDateString()} – {l.ended_at ? new Date(l.ended_at).toLocaleDateString() : ""}
                        {l.ended_by === "doctor" ? " · ended by the doctor" : ""}
                        {l.end_reason ? ` · ${l.end_reason}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function DoctorCard({ link }: { link: CareLink }) {
  const d = link.doctor!;
  const [ending, setEnding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    setBusy(true);
    setError(null);
    try {
      await endCare(link.id, reason.trim() || null);
    } catch (e) {
      setError(careErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-sky-50 to-white p-5 dark:from-sky-950/40 dark:to-zinc-950">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">Your doctor</div>
        <div className="mt-3 flex items-center gap-3">
          <Avatar name={d.full_name} size={52} tone="blue" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold tracking-tight">{doctorName(d.full_name)}</div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">{[d.specialty, d.hospital, d.city].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        {d.bio ? <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{d.bio}</p> : null}
        <p className="mt-3 text-xs text-zinc-500">Connected since {new Date(link.started_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
        {ending ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {doctorName(d.full_name)} will stop seeing your records straight away. Your records stay with you, and you can choose a doctor again at any time.
            </p>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason (optional)" className={inputClass} />
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={() => void end()} loading={busy}>End care</Button>
              <Button variant="ghost" size="sm" onClick={() => setEnding(false)}>Keep {doctorName(d.full_name)}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link href="/care/doctors" className={buttonClass("secondary", "sm")}>Change doctor</Link>
            <Button variant="ghost" size="sm" onClick={() => setEnding(true)}>End care</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
