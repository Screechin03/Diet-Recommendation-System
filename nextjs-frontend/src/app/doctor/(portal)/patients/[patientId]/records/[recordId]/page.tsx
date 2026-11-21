"use client";

import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useLiveData } from "@/components/care/hooks";
import { RecordContent } from "@/components/care/RecordContent";
import { DoctorReviewPanel } from "@/components/care/ReviewPanels";
import { BackLink, KindIcon, Notice, PageSpinner, Pill, ReviewPill, SeverityPill } from "@/components/care/ui";
import { careErrorMessage, formatDateTime, getPatientProfile, getRecord, KIND_COPY, type HealthRecord } from "@/lib/care";

export default function DoctorRecordPage() {
  const { patientId, recordId } = useParams<{ patientId: string; recordId: string }>();
  const [record, setRecord] = useState<HealthRecord | null | undefined>(undefined);
  const [patientName, setPatientName] = useState<string>("Patient");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([getRecord(recordId), getPatientProfile(patientId)]);
      // RLS returns nothing once the patient has switched doctors: treat both cases as "no access".
      setRecord(r && r.patient_id === patientId ? r : null);
      if (p?.full_name) setPatientName(p.full_name);
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load this record."));
    }
  }, [patientId, recordId]);

  useLiveData(load, 30_000);

  if (record === undefined && !error) return <PageSpinner />;
  if (!record) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <BackLink href={`/doctor/patients/${patientId}`}>Back to patient</BackLink>
        <div className="mt-6">
          <Notice tone={error ? "red" : "amber"} title={error ? "Couldn't load this record" : "This record isn't available"}>
            {error ?? "The patient may have deleted it, or she is no longer connected to you."}
          </Notice>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <BackLink href={`/doctor/patients/${patientId}`}>{patientName}</BackLink>
      <div className="mt-4 flex items-start gap-3">
        <KindIcon kind={record.kind} size={44} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{record.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <span>{patientName} · {KIND_COPY[record.kind].label} · saved {formatDateTime(record.created_at)}</span>
            {record.severity !== "info" ? <SeverityPill severity={record.severity} /> : null}
            <ReviewPill record={record} doctorView />
            {record.is_sample ? <Pill tone="amber">Sample data, not a real measurement</Pill> : null}
          </div>
          {record.summary ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{record.summary}</p> : null}
        </div>
      </div>
      {error ? <div className="mt-4"><Notice tone="red">{error}</Notice></div> : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <RecordContent record={record} />
        </div>
        <aside className="lg:sticky lg:top-6">
          <DoctorReviewPanel record={record} onReviewed={() => void load()} />
        </aside>
      </div>
    </div>
  );
}
