"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useRef, useState } from "react";
import { DietSummary } from "@/components/care/DietSummary";
import { DietInstructionsEditor, VitalsHistory } from "@/components/care/DoctorTools";
import { DoctorMedicinesTab } from "@/components/meds/DoctorMedicinesTab";
import { useLiveData } from "@/components/care/hooks";
import { RecordList } from "@/components/care/RecordList";
import { Thread } from "@/components/care/Thread";
import { Avatar, BackLink, Button, Card, CountBadge, doctorInputClass, EmptyState, Notice, PageSpinner, Pill, Spinner } from "@/components/care/ui";
import { FileIcon } from "@/components/report/icons";
import {
  careErrorMessage,
  doctorPatients,
  doctorUnreadForPatient,
  endCare,
  getDietInstructions,
  getPatientProfile,
  listRecords,
  listRecordsOfKind,
  markPatientSeen,
  timeAgo,
  type DietInstructions,
  type DoctorPatientRow,
  type HealthRecord,
  type PatientProfile,
  type RecordSummary,
} from "@/lib/care";

type Tab = "records" | "medicines" | "vitals" | "diet" | "messages";

const CONDITIONS: Array<[string, string]> = [
  ["has_gestational_diabetes", "Gestational diabetes"],
  ["has_anemia", "Anaemia"],
  ["has_morning_sickness", "Morning sickness"],
  ["has_heartburn", "Heartburn"],
  ["has_constipation", "Constipation"],
];

function asTab(t: string | null): Tab {
  return t === "medicines" || t === "vitals" || t === "diet" || t === "messages" ? t : "records";
}

export default function DoctorPatientPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <DoctorPatient />
    </Suspense>
  );
}

function DoctorPatient() {
  const { patientId } = useParams<{ patientId: string }>();
  const router = useRouter();
  const [row, setRow] = useState<DoctorPatientRow | null | undefined>(undefined);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [records, setRecords] = useState<RecordSummary[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [diet, setDiet] = useState<DietInstructions | null>(null);
  const [vitals, setVitals] = useState<HealthRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => asTab(searchParams.get("tab")));
  const [dietLoaded, setDietLoaded] = useState(false);
  const seenMarked = useRef(false);

  const load = useCallback(async () => {
    try {
      const rows = await doctorPatients();
      const r = rows.find((x) => x.patient_id === patientId) ?? null;
      setRow(r);
      if (!r || r.status !== "active") return;
      const [p, recs, u, d] = await Promise.all([
        getPatientProfile(patientId),
        listRecords(patientId),
        doctorUnreadForPatient(patientId),
        getDietInstructions(patientId),
      ]);
      setProfile(p);
      setRecords(recs);
      setUnread(u);
      setDiet(d);
      setDietLoaded(true);
      setError(null);
      if (r.is_new && !seenMarked.current) {
        seenMarked.current = true;
        void markPatientSeen(r.link_id);
      }
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load this patient."));
    }
  }, [patientId]);

  const vitalsTabOpen = tab === "vitals" && row?.status === "active";
  const loadVitals = useCallback(async () => {
    if (!vitalsTabOpen) return;
    try {
      setVitals(await listRecordsOfKind(patientId, "vitals", 30));
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load vital signs."));
    }
  }, [patientId, vitalsTabOpen]);

  useLiveData(load, 20_000);
  useLiveData(loadVitals, 60_000);

  function selectTab(t: Tab) {
    setTab(t);
    window.history.replaceState(null, "", t === "records" ? window.location.pathname : `?tab=${t}`);
  }

  if (row === undefined && !error) return <PageSpinner />;
  if (!row || row.status !== "active") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <BackLink href="/doctor/patients">Patients</BackLink>
        <div className="mt-6">
          <Notice tone={error ? "red" : "amber"} title={error ? "Couldn't load this patient" : "You no longer have access to this patient"}>
            {error ??
              (row
                ? `${row.patient_name} ${row.ended_by === "doctor" ? "was discharged from your care" : "ended care with you or chose another doctor"}${row.ended_at ? ` on ${new Date(row.ended_at).toLocaleDateString()}` : ""}. Her records are no longer shared with you.`
                : "This patient isn’t connected to you.")}
          </Notice>
        </div>
      </div>
    );
  }

  const info = (profile?.info ?? {}) as Record<string, unknown>;
  const conditions = CONDITIONS.filter(([k]) => info[k]).map(([, l]) => l);
  const restrictions = Array.isArray(info.dietary_restrictions) ? (info.dietary_restrictions as string[]) : [];
  const aversions = Array.isArray(info.food_aversions) ? (info.food_aversions as string[]) : [];
  const month = profile?.pregnancy_month ?? row.pregnancy_month;
  const generalUnread = unread.general ?? 0;
  const TABS: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: "records", label: "Records", badge: Object.entries(unread).filter(([k]) => k !== "general").reduce((n, [, v]) => n + v, 0) },
    { id: "medicines", label: "Medicines" },
    { id: "vitals", label: "Vital signs" },
    { id: "diet", label: "Diet" },
    { id: "messages", label: "Messages", badge: generalUnread },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <BackLink href="/doctor/patients">Patients</BackLink>

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-start gap-4 bg-gradient-to-br from-sky-50/80 to-white p-5 dark:from-sky-950/30 dark:to-zinc-950">
          <Avatar name={row.patient_name} size={60} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{profile?.full_name ?? row.patient_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span>{month ? `Month ${month} of pregnancy` : "Month not set"}</span>
              {typeof info.age === "number" ? <span>· {info.age} years</span> : null}
              <span>· Connected {timeAgo(row.started_at)}</span>
              {row.is_new ? <Pill tone="green" dot>New patient</Pill> : null}
            </div>
            {conditions.length || restrictions.length || aversions.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {conditions.map((c) => <Pill key={c} tone="amber">{c}</Pill>)}
                {restrictions.map((r) => <Pill key={r} tone="blue">{r}</Pill>)}
                {aversions.map((a) => <Pill key={a}>avoids {a}</Pill>)}
              </div>
            ) : null}
            {row.patient_note ? (
              <p className="mt-3 max-w-2xl rounded-xl bg-white/80 p-3 text-sm italic text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
                “{row.patient_note}”
                <span className="mt-1 block text-xs not-italic text-zinc-500">Note from the patient when she chose you</span>
              </p>
            ) : null}
          </div>
          <EndCareButton linkId={row.link_id} name={row.patient_name} onEnded={() => router.push("/doctor/patients")} />
        </div>
        <div className="flex gap-1 overflow-x-auto border-t border-zinc-100 px-3 dark:border-zinc-800" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
                tab === t.id ? "border-sky-600 text-sky-800 dark:text-sky-300" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {t.label} <CountBadge n={t.badge ?? 0} />
            </button>
          ))}
        </div>
      </Card>

      {error ? <div className="mt-4"><Notice tone="red">{error}</Notice></div> : null}

      <div className="mt-6">
        {tab === "records" ? (
          records === null ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Loading records…</div>
          ) : (
            <RecordList
              records={records}
              unread={unread}
              doctorView
              hrefFor={(r) => `/doctor/patients/${patientId}/records/${r.id}`}
              empty={<EmptyState icon={<FileIcon size={28} />} title="No records yet" text="Reports, vital signs, risk checks and diet plans the patient saves will appear here automatically." />}
            />
          )
        ) : null}

        {tab === "medicines" ? <DoctorMedicinesTab patientId={patientId} month={month ?? null} records={records} /> : null}

        {tab === "vitals" ? (
          vitals === null ? <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Loading…</div> : <VitalsHistory patientId={patientId} records={vitals} />
        ) : null}

        {tab === "diet" ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            {dietLoaded ? (
              <DietInstructionsEditor patientId={patientId} patientName={row.patient_name.split(" ")[0]} current={diet} onSaved={setDiet} />
            ) : (
              <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Loading…</div>
            )}
            <div className="space-y-4">
              <Card className="p-5">
                <h3 className="text-sm font-semibold">What the patient sees</h3>
                {diet && (diet.avoid.length || diet.include.length || diet.restrictions.length || diet.note) ? (
                  <DietSummary d={diet} />
                ) : (
                  <p className="mt-2 text-sm text-zinc-500">No instructions yet.</p>
                )}
              </Card>
              <LatestDietPlan patientId={patientId} records={records} />
            </div>
          </div>
        ) : null}

        {tab === "messages" ? (
          <Card className="mx-auto max-w-3xl p-5">
            <h3 className="mb-3 font-semibold">Conversation with {row.patient_name}</h3>
            <Thread
              patientId={patientId}
              canWrite
              accent="sky"
              placeholder={`Message ${row.patient_name.split(" ")[0]}…`}
              emptyText="No messages yet."
              maxHeight={520}
            />
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function LatestDietPlan({ patientId, records }: { patientId: string; records: RecordSummary[] | null }) {
  const plan = records?.find((r) => r.kind === "diet_plan");
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold">Latest diet plan</h3>
      {plan ? (
        <Link href={`/doctor/patients/${patientId}/records/${plan.id}`} className="mt-2 block rounded-xl bg-zinc-50 p-3 text-sm hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800">
          <div className="font-medium">{plan.title}</div>
          <div className="text-xs text-zinc-500">{timeAgo(plan.created_at)}{plan.summary ? ` · ${plan.summary}` : ""}</div>
        </Link>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">The patient hasn’t saved a diet plan yet.</p>
      )}
    </Card>
  );
}

function EndCareButton({ linkId, name, onEnded }: { linkId: string; name: string; onEnded: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>End care</Button>;
  }
  return (
    <div className="w-full max-w-sm space-y-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm">You’ll lose access to {name}’s records. She can choose another doctor.</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason shown to the patient (optional)" className={doctorInputClass} />
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          variant="danger"
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await endCare(linkId, reason.trim() || null);
              onEnded();
            } catch (e) {
              setError(careErrorMessage(e));
              setBusy(false);
            }
          }}
        >
          End care
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
