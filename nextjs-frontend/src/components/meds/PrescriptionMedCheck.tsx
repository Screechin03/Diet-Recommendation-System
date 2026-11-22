"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button, Notice, Spinner } from "@/components/care/ui";
import { MedCheckView } from "@/components/meds/MedCheckView";
import { PillIcon } from "@/components/report/icons";
import { careErrorMessage } from "@/lib/care";
import { addMyMedicines, checkMedicines, PREFILL_KEY, type MedCheckResult, type MedicineEntry } from "@/lib/meds";

/**
 * Step 2 of the prescription flow: checks the medicines just read from the prescription for the patient's
 * month of pregnancy. Runs by itself; the result is passed up so "refer to doctor" includes it.
 * Give it a new `key` for each scan.
 */
export function PrescriptionMedCheck({ medicines, onResult }: { medicines: MedicineEntry[]; onResult: (r: MedCheckResult | null) => void }) {
  const router = useRouter();
  const { user, role, account, careAvailable } = useAuth();
  const isPatient = Boolean(user) && role === "patient" && careAvailable;
  const [month, setMonth] = useState<number | null>(account?.patient?.pregnancy_month ?? null);
  const [state, setState] = useState<{ month: number | null; result: MedCheckResult | null; error: string | null } | null>(null);
  const [added, setAdded] = useState<"idle" | "busy" | "done">("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!medicines.length) return;
    let alive = true;
    checkMedicines(medicines, month).then(
      (result) => {
        if (!alive) return;
        setState({ month, result, error: null });
        onResultRef.current(result);
      },
      (e) => {
        if (alive) setState({ month, result: null, error: careErrorMessage(e, "Couldn't check the medicines.") });
      },
    );
    return () => {
      alive = false;
    };
  }, [medicines, month]);

  if (!medicines.length) return null;
  const current = state && state.month === month ? state : null;

  async function addToMine() {
    if (!user) return;
    setAdded("busy");
    setAddError(null);
    try {
      await addMyMedicines(user.id, medicines, "prescription");
      setAdded("done");
    } catch (e) {
      setAddError(careErrorMessage(e, "Couldn't add them."));
      setAdded("idle");
    }
  }

  function openFull() {
    try {
      sessionStorage.setItem(PREFILL_KEY, JSON.stringify(medicines));
    } catch {
      // private mode: the page simply opens empty
    }
    router.push("/medicines");
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-sky-200 bg-white dark:border-sky-900/60 dark:bg-zinc-900/60 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-sky-50/70 px-5 py-4 dark:border-sky-900/40 dark:bg-sky-950/30">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white"><PillIcon size={18} /></span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-400">Step 2 · Medicine safety</div>
            <div className="font-semibold">Are these medicines OK in pregnancy?</div>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Month</span>
          <select
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            aria-label="Month of pregnancy"
          >
            <option value="">Not sure</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-4 p-5">
        {!current ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500"><Spinner /> Checking {medicines.length} medicine{medicines.length === 1 ? "" : "s"}…</div>
        ) : current.error ? (
          <Notice tone="red">{current.error}</Notice>
        ) : current.result ? (
          <MedCheckView result={current.result} compact />
        ) : null}
        {current?.result ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={openFull}>Daily timing plan &amp; full check</Button>
            {isPatient ? (
              <Button variant="secondary" size="sm" onClick={() => void addToMine()} loading={added === "busy"} disabled={added === "done"}>
                {added === "done" ? "Added to My medicines ✓" : "Add to My medicines"}
              </Button>
            ) : null}
          </div>
        ) : null}
        {addError ? <p className="text-sm text-rose-600">{addError}</p> : null}
      </div>
    </section>
  );
}
