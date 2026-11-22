"use client";

import { DayPlanView } from "@/components/mealplan/DayPlanView";

import { useState, type ReactNode } from "react";
import { RecipeCard } from "@/components/RecipeCard";
import { DietPlanView, ReportView } from "@/components/report/ReportView";
import { AlertIcon, CheckIcon, FileIcon, ScanIcon, SparkIcon } from "@/components/report/icons";
import { Button, Card, ExternalIcon, Notice, Pill } from "@/components/care/ui";
import { MedCheckView } from "@/components/meds/MedCheckView";
import { VitalsResults } from "@/components/vitals/VitalsResults";
import type { MedCheckResult } from "@/lib/meds";
import { careErrorMessage, doctorName, fileUrl, type HealthRecord } from "@/lib/care";
import { probabilityToPercent, type DietPlanRecordData, type ReportRecordData, type RiskRecordData } from "@/lib/careRecords";
import { formatBytes, isEmptyReport, normalizeDietPlan, normalizeReport } from "@/lib/report";
import type { VitalsAnalysis } from "@/lib/vitals";

/** Renders a saved record. Old or partial data is shown as far as it goes rather than failing. */
export function RecordContent({ record }: { record: HealthRecord }) {
  switch (record.kind) {
    case "report":
      return <ReportRecord record={record} />;
    case "vitals":
      return isVitals(record.data) ? <VitalsResults analysis={record.data} /> : <Unreadable />;
    case "risk":
      return <RiskRecord data={record.data as unknown as RiskRecordData} />;
    case "diet_plan":
      return <DietPlanRecord data={record.data as unknown as DietPlanRecordData} />;
    case "med_check": {
      const r = (record.data as { result?: MedCheckResult }).result;
      return r?.medicines ? <MedCheckView result={r} /> : <Unreadable />;
    }
    default:
      return <Unreadable />;
  }
}

function isVitals(d: unknown): d is VitalsAnalysis {
  const v = d as Partial<VitalsAnalysis> | null;
  return Boolean(v && v.metrics && v.session && Array.isArray(v.findings));
}

function Unreadable() {
  return <Notice tone="amber" title="This record can't be displayed">It was saved by an older version of the app.</Notice>;
}

// ---------------------------------------------------------------------------------------------------------

function OriginalFile({ record }: { record: HealthRecord }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!record.file_path) return null;
  async function open() {
    setBusy(true);
    setError(null);
    // Open the tab first (popup blockers allow it only during the click), then point it at the signed link.
    const tab = window.open("", "_blank");
    try {
      const url = await fileUrl(record.file_path as string);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      setError(careErrorMessage(e, "Couldn't open the document."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
        <FileIcon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{record.file_name ?? "Original document"}</div>
        <div className="text-xs text-zinc-500">
          Original upload{record.file_size ? ` · ${formatBytes(record.file_size)}` : ""}
        </div>
        {error ? <div className="mt-1 text-xs text-rose-600">{error}</div> : null}
      </div>
      <Button variant="secondary" size="sm" onClick={() => void open()} loading={busy}>
        <ExternalIcon size={14} /> View original
      </Button>
    </Card>
  );
}

function ReportRecord({ record }: { record: HealthRecord }) {
  const data = record.data as unknown as Partial<ReportRecordData>;
  const report = normalizeReport(data.extracted);
  const plan = normalizeDietPlan(data.diet_plan);
  const structured = !isEmptyReport(report);
  return (
    <div className="space-y-4">
      <OriginalFile record={record} />
      {structured && report ? <ReportView report={report} /> : null}
      {data.med_check?.medicines ? (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Medicine safety check (month {data.med_check.pregnancy_month ?? "not set"})</h3>
          <MedCheckView result={data.med_check} />
        </Card>
      ) : null}
      {plan ? <DietPlanView plan={plan} /> : null}
      {data.ocr?.text ? (
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-zinc-400"><ScanIcon size={16} /></span> Handwriting scan
            <span className="text-xs font-normal text-zinc-500">· {Math.round((data.ocr.avg_confidence ?? 0) * 100)}% confidence</span>
          </h3>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 font-mono text-sm dark:bg-zinc-900">{data.ocr.text}</pre>
        </Card>
      ) : null}
      {!structured && !plan && !data.ocr?.text ? (
        <Notice title="Nothing could be read from this document">Open the original upload above to see it.</Notice>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------

function riskTone(level: string): "red" | "amber" | "green" | "gray" {
  const l = level.toLowerCase();
  if (l.includes("high")) return "red";
  if (l.includes("medium") || l.includes("moderate")) return "amber";
  if (l.includes("low")) return "green";
  return "gray";
}

function Measure({ label, value, unit, normal }: { label: string; value: unknown; unit?: string; normal?: [number, number] }) {
  const n = typeof value === "number" ? value : Number(value);
  const known = value != null && value !== "" && Number.isFinite(n);
  const out = known && normal ? n < normal[0] || n > normal[1] : false;
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${out ? "text-amber-700 dark:text-amber-400" : ""}`}>
        {known ? n : "—"} {known && unit ? <span className="text-xs font-normal text-zinc-500">{unit}</span> : null}
      </div>
    </div>
  );
}

function ListCard({ title, items, icon }: { title: string; items: unknown; icon?: ReactNode }) {
  const list = Array.isArray(items) ? items.map(String).filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <Card className="p-5">
      <h4 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h4>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        {list.map((x, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            {x}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Refined({ refined }: { refined: { title?: string; summary?: string; bullets?: string[] } | null | undefined }) {
  if (!refined || (!refined.summary && !refined.bullets?.length)) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-emerald-600"><SparkIcon size={16} /></span>
        {refined.title ?? "Summary"}
      </div>
      {refined.summary ? <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{refined.summary}</p> : null}
      {refined.bullets?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          {refined.bullets.slice(0, 10).map((b, i) => <li key={i}>{String(b)}</li>)}
        </ul>
      ) : null}
    </Card>
  );
}

function RiskRecord({ data }: { data: RiskRecordData }) {
  const ra = data?.result?.risk_assessment ?? {};
  const level = String(ra.risk_level ?? "Unknown");
  const pct = probabilityToPercent(ra.risk_probability);
  const tone = riskTone(level);
  const input = data?.input ?? ({} as RiskRecordData["input"]);
  const recs = (data?.result?.recommendations ?? {}) as Record<string, unknown>;
  const banner = {
    red: "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30",
    green: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30",
    gray: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40",
  }[tone];
  const bar = { red: "bg-rose-500", amber: "bg-amber-500", green: "bg-emerald-500", gray: "bg-zinc-400" }[tone];
  const flags = [
    input.previous_complications && "Previous complications",
    input.preexisting_diabetes && "Pre-existing diabetes",
    input.gestational_diabetes && "Gestational diabetes",
    input.mental_health_issues && "Mental health concerns",
    input.smoking_history && "Smoking history",
    input.alcohol_consumption && input.alcohol_consumption !== "none" && `Alcohol: ${input.alcohol_consumption}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${banner}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Model estimate</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{level} risk</div>
            {typeof ra.confidence === "number" ? (
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Confidence {Math.round(Math.min(1, Math.max(0, ra.confidence)) * 100)}%</div>
            ) : null}
          </div>
          {pct != null ? (
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-xs text-zinc-500"><span>Risk probability</span><span className="font-semibold text-zinc-800 dark:text-zinc-200">{pct}%</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70 dark:bg-zinc-800">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
        {Array.isArray(ra.risk_factors) && ra.risk_factors.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {ra.risk_factors.slice(0, 12).map((f) => <Pill key={String(f)}>{String(f)}</Pill>)}
          </div>
        ) : null}
      </div>

      <Card className="p-5">
        <h4 className="text-sm font-semibold">Measurements entered</h4>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Measure label="Age" value={input.age} />
          <Measure label="Blood pressure" value={input.systolic_bp != null ? `${input.systolic_bp}` : null} unit={input.diastolic_bp != null ? `/ ${input.diastolic_bp} mmHg` : "mmHg"} normal={[90, 139]} />
          <Measure label="Blood sugar" value={input.blood_sugar} unit="mmol/L" normal={[4, 7.8]} />
          <Measure label="Heart rate" value={input.heart_rate} unit="bpm" normal={[60, 100]} />
          <Measure label="Body temp" value={input.body_temp} unit="°F" normal={[97, 99.5]} />
          <Measure label="BMI" value={input.bmi} normal={[18.5, 29.9]} />
          <Measure label="Sleep" value={input.sleep_hours} unit="h" normal={[7, 10]} />
          <div className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Stress · exercise</div>
            <div className="mt-0.5 text-sm font-semibold capitalize">{input.stress_level ?? "—"} · {input.exercise_frequency ?? "—"}</div>
          </div>
        </div>
        {flags.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {flags.map((f) => <Pill key={f} tone="amber">{f}</Pill>)}
          </div>
        ) : null}
      </Card>

      <Refined refined={data?.refined} />
      <div className="grid gap-4 md:grid-cols-2">
        <ListCard title="Immediate actions" items={recs.immediate_actions} icon={<span className="text-rose-500"><AlertIcon size={16} /></span>} />
        <ListCard title="Lifestyle changes" items={recs.lifestyle_changes} icon={<span className="text-emerald-600"><CheckIcon size={16} /></span>} />
        <ListCard title="Monitoring" items={recs.monitoring_requirements} />
        <ListCard title="Consultations" items={recs.medical_consultations} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------

const CONDITION_LABELS: Array<[keyof DietPlanRecordData["pregnancy_info"], string]> = [
  ["has_gestational_diabetes", "Gestational diabetes"],
  ["has_anemia", "Anaemia"],
  ["has_morning_sickness", "Morning sickness"],
  ["has_heartburn", "Heartburn"],
  ["has_constipation", "Constipation"],
];

function DietPlanRecord({ data }: { data: DietPlanRecordData }) {
  const info = data?.pregnancy_info ?? ({} as DietPlanRecordData["pregnancy_info"]);
  const recipes = Array.isArray(data?.recipes) ? data.recipes : [];
  const conditions = CONDITION_LABELS.filter(([k]) => info[k]).map(([, l]) => l);
  const gain = Number(info.current_weight) - Number(info.pre_pregnancy_weight);
  const di = data?.doctor_instructions;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h4 className="text-sm font-semibold">Profile used for this plan</h4>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Measure label="Month" value={info.pregnancy_month} />
          <Measure label="Age" value={info.age} />
          <Measure label="Weight now" value={info.current_weight} unit="kg" />
          <Measure label="Weight gain" value={Number.isFinite(gain) ? Math.round(gain * 10) / 10 : null} unit="kg" />
          <Measure label="Height" value={info.height} unit="cm" />
          <div className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">Activity</div>
            <div className="mt-0.5 text-sm font-semibold capitalize">{info.activity_level ?? "moderate"}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {conditions.map((c) => <Pill key={c} tone="amber">{c}</Pill>)}
          {(info.dietary_restrictions ?? []).map((r) => <Pill key={r} tone="blue">{r}</Pill>)}
          {(info.food_aversions ?? []).map((a) => <Pill key={a}>avoids {a}</Pill>)}
          {data?.ingredients?.length ? <Pill tone="green">prefers {data.ingredients.join(", ")}</Pill> : null}
        </div>
      </Card>

      {data?.meal_plan?.days?.length ? <DayPlanView plan={data.meal_plan} /> : null}

      {di && (di.avoid.length || di.include.length || di.restrictions.length || di.note) ? (
        <Notice tone="blue" title={`${doctorName(di.by)}'s diet instructions were applied`}>
          {[
            di.restrictions.length ? `Diet: ${di.restrictions.join(", ")}` : null,
            di.avoid.length ? `Avoid: ${di.avoid.join(", ")}` : null,
            di.include.length ? `Include: ${di.include.join(", ")}` : null,
          ].filter(Boolean).join(" · ")}
          {di.note ? <div className="mt-1 italic">“{di.note}”</div> : null}
        </Notice>
      ) : null}

      <Refined refined={data?.refined} />

      {recipes.length && !data?.meal_plan?.days?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recipes.map((r, i) => <RecipeCard key={`${r.Name}-${i}`} recipe={r} />)}
        </div>
      ) : (
        <Notice>No recipes were returned for this plan.</Notice>
      )}
    </div>
  );
}
