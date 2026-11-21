"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useLiveData } from "@/components/care/hooks";
import { Button, Card, EmptyState, Notice, Spinner } from "@/components/care/ui";
import { MedCheckView } from "@/components/meds/MedCheckView";
import { PillIcon } from "@/components/report/icons";
import { careErrorMessage, timeAgo, type RecordSummary } from "@/lib/care";
import { checkMedicines, listMyMedicines, type MedCheckResult, type PatientMedication } from "@/lib/meds";

/** Doctor's view of the patient's current medicines, with an on-demand safety check for her month. */
export function DoctorMedicinesTab({ patientId, month, records }: { patientId: string; month: number | null; records: RecordSummary[] | null }) {
  const [meds, setMeds] = useState<PatientMedication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<MedCheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMeds(await listMyMedicines(patientId));
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load the medicines."));
    }
  }, [patientId]);
  useLiveData(load, 60_000);

  async function run() {
    if (!meds?.length) return;
    setBusy(true);
    setError(null);
    try {
      setCheck(await checkMedicines(meds, month));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed.");
    } finally {
      setBusy(false);
    }
  }

  const checks = (records ?? []).filter((r) => r.kind === "med_check").slice(0, 5);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Current medicines</h3>
            {meds?.length ? (
              <Button variant="sky" size="sm" onClick={() => void run()} loading={busy}>
                Check these{month ? ` for month ${month}` : ""}
              </Button>
            ) : null}
          </div>
          {error ? <div className="mt-3"><Notice tone="red">{error}</Notice></div> : null}
          {meds === null && !error ? <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Loading…</div> : null}
          {meds && !meds.length ? (
            <div className="mt-3"><EmptyState icon={<PillIcon size={26} />} title="No medicines listed" text="The patient adds them on the Medicines page or from a scanned prescription." /></div>
          ) : null}
          {meds?.length ? (
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-900">
              {meds.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-zinc-500">
                    {[m.dose, m.frequency].filter(Boolean).join(" · ") || "dose not given"}
                    {m.source === "prescription" ? " · from prescription" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
        {check ? <MedCheckView result={check} /> : null}
      </div>
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Checks the patient saved</h3>
        {checks.length ? (
          <ul className="mt-2 space-y-2">
            {checks.map((r) => (
              <li key={r.id}>
                <Link href={`/doctor/patients/${patientId}/records/${r.id}`} className="block rounded-xl bg-zinc-50 p-3 text-sm hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800">
                  <div className="font-medium">{r.title}</div>
                  <div className="line-clamp-2 text-xs text-zinc-500">{timeAgo(r.created_at)} · {r.summary}</div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">None yet.</p>
        )}
      </Card>
    </div>
  );
}
