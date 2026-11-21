"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLiveData } from "@/components/care/hooks";
import { ShareWithDoctor } from "@/components/care/ShareWithDoctor";
import { Button, buttonClass, ClockIcon, Notice, ShieldIcon } from "@/components/care/ui";
import { MedCheckView } from "@/components/meds/MedCheckView";
import { MedicineRows, MedicineSearch, type EditableMedicine } from "@/components/meds/MedicineListEditor";
import { AlertIcon, FileIcon, PillIcon } from "@/components/report/icons";
import { careErrorMessage, updatePregnancyMonth } from "@/lib/care";
import {
  addMyMedicines,
  checkMedicines,
  deleteMyMedicine,
  listMyMedicines,
  medCheckRecord,
  PREFILL_KEY,
  updateMyMedicine,
  type MedCheckResult,
  type MedicineEntry,
} from "@/lib/meds";

type Item = EditableMedicine & { id?: string; dirty?: boolean };

let counter = 0;
const newKey = () => `m${Date.now().toString(36)}${counter++}`;

export default function MedicinesPage() {
  const { user, role, account, careAvailable } = useAuth();
  const isPatient = Boolean(user) && role === "patient" && careAvailable;
  const [month, setMonth] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MedCheckResult | null>(null);
  const [runId, setRunId] = useState(0);
  const prefilled = useRef(false);

  // Month from the patient's profile, once known.
  const [monthFor, setMonthFor] = useState<string | null>(null);
  const profileMonth = account?.patient?.pregnancy_month ?? null;
  if (user && monthFor !== user.id && account) {
    setMonthFor(user.id);
    if (profileMonth) setMonth(profileMonth);
  }

  const load = useCallback(async () => {
    if (loaded) return;
    let start: Item[] = [];
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      if (raw && !prefilled.current) {
        prefilled.current = true;
        sessionStorage.removeItem(PREFILL_KEY);
        start = (JSON.parse(raw) as MedicineEntry[]).map((m) => ({ ...m, key: newKey() }));
      }
    } catch {
      // ignore broken prefill
    }
    if (isPatient && user) {
      try {
        const mine = (await listMyMedicines(user.id)).map((m) => ({ ...m, key: m.id }));
        const known = new Set(mine.map((m) => m.name.toLowerCase()));
        start = [...mine, ...start.filter((m) => !known.has(m.name.toLowerCase()))];
      } catch (e) {
        setError(careErrorMessage(e, "Couldn't load your medicines."));
      }
    }
    setItems(start);
    setLoaded(true);
  }, [isPatient, user, loaded]);
  useLiveData(load, 600_000);

  async function add(name: string) {
    setError(null);
    if (items.some((m) => m.name.toLowerCase() === name.toLowerCase())) return;
    if (isPatient && user) {
      try {
        const [row] = await addMyMedicines(user.id, [{ name }], "manual");
        setItems((xs) => [...xs, { ...row, key: row.id }]);
        return;
      } catch (e) {
        setError(careErrorMessage(e, "Couldn't save that medicine."));
      }
    }
    setItems((xs) => [...xs, { name, key: newKey() }]);
  }

  async function remove(key: string) {
    const item = items.find((m) => m.key === key);
    setItems((xs) => xs.filter((m) => m.key !== key));
    if (item?.id) {
      try {
        await deleteMyMedicine(item.id);
      } catch (e) {
        setError(careErrorMessage(e, "Couldn't remove that medicine."));
      }
    }
  }

  async function run() {
    const meds = items.filter((m) => m.name.trim());
    if (!meds.length) return;
    setBusy(true);
    setError(null);
    try {
      // Save edits to "My medicines" (and new unsaved prefilled rows) before checking.
      if (isPatient && user) {
        await Promise.all(meds.filter((m) => m.id && m.dirty).map((m) => updateMyMedicine(m.id!, { name: m.name.trim(), dose: m.dose || null, frequency: m.frequency || null })));
        const unsaved = meds.filter((m) => !m.id);
        if (unsaved.length) {
          const rows = await addMyMedicines(user.id, unsaved, "prescription");
          setItems((xs) => xs.map((m) => {
            const row = !m.id ? rows.find((r) => r.name === m.name.trim()) : undefined;
            return row ? { ...row, key: m.key } : { ...m, dirty: false };
          }));
        }
        if (month && month !== profileMonth) void updatePregnancyMonth(user.id, month).catch(() => undefined);
      }
      setResult(await checkMedicines(meds, month));
      setRunId((n) => n + 1);
    } catch (e) {
      setError(e instanceof TypeError ? "Couldn't reach the server. Check your connection." : e instanceof Error ? e.message : "Check failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (result) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [runId, result]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-10">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-400">Medicine safety</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Is this medicine OK in pregnancy?</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Add your medicines, vitamins and supplements. We check each one for your month of pregnancy, look for combinations
          that clash, and suggest when to take them so they don’t block each other.
        </p>
      </div>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Month of pregnancy</span>
              <select
                value={month ?? ""}
                onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <option value="">Not sure (check all trimesters)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => <option key={m} value={m}>Month {m}</option>)}
              </select>
            </label>
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-semibold">Your medicines</span>
                {isPatient ? <span className="text-[11px] text-zinc-500">Saved · your doctor can see them</span> : null}
              </div>
              <MedicineSearch onAdd={(n) => void add(n)} disabled={!loaded} />
              <div className="mt-3">
                <MedicineRows
                  items={items}
                  onChange={(key, patch) => setItems((xs) => xs.map((m) => (m.key === key ? { ...m, ...patch, dirty: true } : m)))}
                  onRemove={(key) => void remove(key)}
                />
              </div>
            </div>
            {error ? <Notice tone="red">{error}</Notice> : null}
            <Button variant="emerald" className="w-full" onClick={() => void run()} loading={busy} disabled={!items.some((m) => m.name.trim())}>
              Check {items.length ? `${items.length} medicine${items.length === 1 ? "" : "s"}` : "medicines"}
            </Button>
            <Link href="/prescription-reader" className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              <FileIcon size={15} /> Or scan a prescription
            </Link>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {result ? (
            <>
              <MedCheckView result={result} />
              <ShareWithDoctor key={runId} build={() => medCheckRecord(result)} what="this medicine check" />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-8 dark:border-zinc-800 dark:bg-zinc-950/40">
              <div className="font-semibold">What we check</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  [<ShieldIcon key="i" size={18} />, "Pregnancy safety", "For your month of pregnancy, with the reason and where it comes from."],
                  [<AlertIcon key="i" size={18} />, "Clashes", "Medicines that shouldn’t be combined, or that double up the same ingredient."],
                  [<ClockIcon key="i" size={18} />, "Timing", "A daily plan, e.g. thyroid tablet 4 hours away from iron and calcium."],
                ].map(([icon, t, d]) => (
                  <div key={t as string} className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/60">
                    <span className="text-emerald-600">{icon}</span>
                    <div className="mt-2 text-sm font-medium">{t}</div>
                    <div className="mt-1 text-xs leading-5 text-zinc-500">{d}</div>
                  </div>
                ))}
              </div>
              <p className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
                <PillIcon size={14} /> Hand-checked information on common pregnancy medicines and Indian brands. A screening aid, not a prescription.
              </p>
              {!user ? (
                <p className="mt-3 text-xs text-zinc-500">
                  <Link href="/login" className={buttonClass("secondary", "sm")}>Log in</Link> to keep your list and share checks with your doctor.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
