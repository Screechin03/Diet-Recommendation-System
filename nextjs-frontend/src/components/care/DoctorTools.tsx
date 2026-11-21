"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { XIcon } from "@/components/report/icons";
import { Button, Card, doctorInputClass, EmptyState, HeartPulseIcon, Pill, SeverityPill } from "@/components/care/ui";
import {
  careErrorMessage,
  doctorName,
  formatDateTime,
  setDietInstructions,
  type DietInstructions,
  type HealthRecord,
} from "@/lib/care";
import { formatDuration, type VitalsAnalysis } from "@/lib/vitals";

const RESTRICTIONS = [
  ["vegetarian", "Vegetarian"],
  ["vegan", "Vegan"],
  ["gluten-free", "Gluten-free"],
  ["dairy-free", "Dairy-free"],
  ["egg-free", "Egg-free"],
  ["nut-free", "Nut-free"],
  ["soy-free", "Soy-free"],
] as const;

function ChipInput({ label, values, onChange, placeholder, tone }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; tone: "red" | "green" }) {
  const [draft, setDraft] = useState("");
  function add(raw: string) {
    const items = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!items.length) return;
    onChange([...values, ...items.filter((i) => !values.includes(i))].slice(0, 30));
    setDraft("");
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  }
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-white p-2 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-500/10 dark:border-zinc-800 dark:bg-zinc-950">
        {values.map((v) => (
          <span key={v} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tone === "red" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="opacity-60 hover:opacity-100">
              <XIcon size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => add(draft)}
          placeholder={values.length ? "Add more…" : placeholder}
          aria-label={label}
          className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-zinc-400"
        />
      </div>
    </div>
  );
}

/** Doctor sets foods to avoid / include, diet restrictions and a note. The patient's planner applies them. */
export function DietInstructionsEditor({ patientId, patientName, current, onSaved }: { patientId: string; patientName: string; current: DietInstructions | null; onSaved: (d: DietInstructions) => void }) {
  const [avoid, setAvoid] = useState<string[]>(current?.avoid ?? []);
  const [include, setInclude] = useState<string[]>(current?.include ?? []);
  const [restrictions, setRestrictions] = useState<string[]>(current?.restrictions ?? []);
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const d = await setDietInstructions(patientId, { avoid, include, restrictions, note: note.trim() || null });
      setAvoid(d.avoid);
      setInclude(d.include);
      setRestrictions(d.restrictions);
      setNote(d.note ?? "");
      setSaved(true);
      onSaved(d);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't save the instructions."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Diet instructions</h3>
        {current?.updated_at ? (
          <span className="text-xs text-zinc-500">Last updated {formatDateTime(current.updated_at)} by {doctorName(current.updated_by_name)}</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {patientName}’s diet planner applies these automatically: avoided foods are filtered out, preferred foods are favoured, and the restrictions are enforced.
      </p>
      <div className="mt-4 space-y-4">
        <ChipInput label="Avoid" tone="red" values={avoid} onChange={setAvoid} placeholder="e.g. papaya, raw sprouts (Enter to add)" />
        <ChipInput label="Include more" tone="green" values={include} onChange={setInclude} placeholder="e.g. spinach, lentils, dates" />
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Diet</span>
          <div className="flex flex-wrap gap-2">
            {RESTRICTIONS.map(([key, label]) => {
              const on = restrictions.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setRestrictions(on ? restrictions.filter((r) => r !== key) : [...restrictions, key])}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? "border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-200" : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Note to the patient</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={doctorInputClass} placeholder="e.g. Iron-rich food twice a day; take the iron tablet with orange juice, not tea." />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="sky" onClick={() => void save()} loading={busy}>Save instructions</Button>
        {saved ? <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved. {patientName} sees them now.</span> : null}
      </div>
    </Card>
  );
}

function isVitals(d: unknown): d is VitalsAnalysis {
  const v = d as Partial<VitalsAnalysis> | null;
  return Boolean(v && v.metrics && v.session);
}

/** One row per saved device session, so the doctor can compare them over time. */
export function VitalsHistory({ patientId, records }: { patientId: string; records: HealthRecord[] }) {
  if (!records.length) {
    return <EmptyState icon={<HeartPulseIcon size={28} />} title="No vital-sign sessions yet" text="Sessions from the MamaCare device appear here when the patient saves them." />;
  }
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-3 py-3 font-semibold">Heart rate</th>
            <th className="px-3 py-3 font-semibold">SpO₂</th>
            <th className="px-3 py-3 font-semibold">Temp</th>
            <th className="px-3 py-3 font-semibold">ECG</th>
            <th className="px-4 py-3 font-semibold">Result</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const a = isVitals(r.data) ? r.data : null;
            const hr = a?.metrics.heart_rate;
            const sp = a?.metrics.spo2;
            const tp = a?.metrics.temperature;
            const ecg = a?.metrics.ecg;
            const ecgOk = ecg && ecg.status !== "unavailable";
            return (
              <tr key={r.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/50">
                <td className="px-4 py-3">
                  <Link href={`/doctor/patients/${patientId}/records/${r.id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                    {formatDateTime(r.created_at)}
                  </Link>
                  <div className="text-xs text-zinc-500">
                    {a ? `${formatDuration(a.session.duration_s)} min · ${a.session.activity === "exercise" ? "exercise" : "rest"}` : ""}
                    {r.is_sample ? " · sample" : ""}
                  </div>
                </td>
                <td className="px-3 py-3 tabular-nums">{hr ? <><b>{hr.avg}</b> <span className="text-xs text-zinc-500">({hr.min}–{hr.max})</span></> : "—"}</td>
                <td className="px-3 py-3 tabular-nums">{sp ? <><b>{sp.avg}%</b> <span className="text-xs text-zinc-500">min {sp.sustained_min}%</span></> : "—"}</td>
                <td className="px-3 py-3 tabular-nums">{tp ? `${tp.avg} °C` : "—"}</td>
                <td className="px-3 py-3">
                  {ecgOk ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="tabular-nums">{ecg.heart_rate} bpm</span>
                      {ecg.rhythm === "irregular" ? <Pill tone="red">Irregular</Pill> : <Pill tone="green">Regular</Pill>}
                    </span>
                  ) : ecg ? <span className="text-xs text-zinc-500">Too noisy</span> : "—"}
                </td>
                <td className="px-4 py-3"><SeverityPill severity={r.severity} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
