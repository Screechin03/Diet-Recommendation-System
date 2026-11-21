"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useCareLinks, useLiveData } from "@/components/care/hooks";
import { RecordContent } from "@/components/care/RecordContent";
import { RequireRole } from "@/components/care/RequireRole";
import { PatientReviewPanel } from "@/components/care/ReviewPanels";
import { BackLink, Button, KindIcon, Notice, PageSpinner, Pill, ReviewPill, SeverityPill, TrashIcon } from "@/components/care/ui";
import { careErrorMessage, deleteRecord, formatDateTime, getRecord, KIND_COPY, type HealthRecord } from "@/lib/care";

export default function PatientRecordPage() {
  return (
    <RequireRole role="patient">
      <PatientRecord />
    </RequireRole>
  );
}

function PatientRecord() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { active } = useCareLinks();
  const [record, setRecord] = useState<HealthRecord | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setRecord(await getRecord(id));
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load this record."));
    }
  }, [id]);

  useLiveData(load, 30_000);

  async function remove() {
    if (!record) return;
    setDeleting(true);
    try {
      await deleteRecord(record);
      router.push("/care");
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't delete this record."));
      setDeleting(false);
    }
  }

  if (record === undefined && !error) return <PageSpinner />;
  if (!record) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <BackLink href="/care">My care</BackLink>
        <div className="mt-6">
          <Notice tone={error ? "red" : "gray"} title={error ? "Couldn't load this record" : "Record not found"}>
            {error ?? "It may have been deleted."}
          </Notice>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <BackLink href="/care">My care</BackLink>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <KindIcon kind={record.kind} size={44} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{record.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              <span>{KIND_COPY[record.kind].label} · {formatDateTime(record.created_at)}</span>
              {record.severity !== "info" ? <SeverityPill severity={record.severity} /> : null}
              <ReviewPill record={record} />
              {record.is_sample ? <Pill>Sample data</Pill> : null}
            </div>
          </div>
        </div>
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm dark:border-rose-900/60 dark:bg-rose-950/30">
            <span className="text-rose-800 dark:text-rose-200">Delete this record and its comments? This can’t be undone.</span>
            <Button variant="danger" size="sm" onClick={() => void remove()} loading={deleting}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
            <TrashIcon size={15} /> Delete
          </Button>
        )}
      </div>
      {error ? <div className="mt-4"><Notice tone="red">{error}</Notice></div> : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <RecordContent record={record} />
        </div>
        <aside className="lg:sticky lg:top-6">
          <PatientReviewPanel record={record} active={active} onChanged={setRecord} />
        </aside>
      </div>
    </div>
  );
}
