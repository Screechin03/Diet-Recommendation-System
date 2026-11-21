// Medicine & supplement safety checker for the app. Same API and types as the website
// (nextjs-frontend/src/lib/meds.ts); backend: FastAPI_Backend/med_safety.

import { apiBaseUrl } from "./api";
import { notifyCareChanged, type NewRecord, type Severity } from "./care";
import { normalizeReport } from "./report";
import { requireSupabase } from "./supabase";

export type MedTier = "generally_used" | "caution" | "avoid" | "unknown";
export type MedStatus = "ok" | "caution" | "avoid";

export interface MedIngredient {
  id: string;
  name: string;
  tier: MedTier;
  by_trimester: Record<"t1" | "t2" | "t3", MedTier>;
  note: string;
  source: string;
  dont_stop: boolean;
  low_dose: boolean;
}

export interface MedResult {
  index: number;
  input: string;
  dose: string | null;
  frequency: string | null;
  matched: boolean;
  label: string;
  kind: "product" | "ingredient" | "combination" | null;
  match_confidence: "exact" | "fuzzy" | null;
  ingredients: MedIngredient[];
  tier: MedTier;
  tier_label: string;
  dont_stop: boolean;
  label_info: { tier: MedTier; category: string | null; source: string } | null;
  model: { drug: string; risk: Record<string, number> | null } | null;
}

export interface MedInteraction {
  a: number;
  b: number;
  severity: "timing" | "caution" | "avoid";
  origin: "curated" | "duplicate" | "model";
  effect: string;
  advice: string;
  gap_hours?: number | null;
  source: string;
  score?: number;
}

export interface MedScheduleSlot {
  slot: string;
  label: string;
  time: string;
  items: Array<{ index: number; label: string; food: string | null }>;
}

export interface MedCheckResult {
  version: string;
  checked_at: string;
  pregnancy_month: number | null;
  trimester: number | null;
  status: MedStatus;
  headline: string;
  medicines: MedResult[];
  interactions: MedInteraction[];
  schedule: { slots: MedScheduleSlot[]; as_needed: Array<{ index: number; label: string }>; weekly: Array<{ index: number; label: string }>; notes: string[] };
  dont_stop: string[];
  model: { available: boolean; model?: string; version?: string; metrics?: Record<string, unknown> };
  disclaimer: string;
}

export interface MedicineEntry {
  name: string;
  dose?: string | null;
  frequency?: string | null;
}

export interface PatientMedication extends MedicineEntry {
  id: string;
  patient_id: string;
  source: "manual" | "prescription";
  created_at: string;
}

export interface MedSuggestion {
  name: string;
  kind: "product" | "ingredient";
  detail: string;
  ingredients: string[];
}

export const TIER_COPY: Record<MedTier, { label: string; short: string; tone: "green" | "amber" | "red" | "gray" }> = {
  generally_used: { label: "Commonly used in pregnancy", short: "Commonly used", tone: "green" },
  caution: { label: "Only if your doctor advises", short: "Ask your doctor", tone: "amber" },
  avoid: { label: "Usually avoided in pregnancy", short: "Usually avoided", tone: "red" },
  unknown: { label: "Not enough information", short: "Not checked", tone: "gray" },
};

export const STATUS_COPY: Record<MedStatus, { label: string; tone: "green" | "amber" | "red" }> = {
  ok: { label: "No problems found", tone: "green" },
  caution: { label: "Check with your doctor", tone: "amber" },
  avoid: { label: "Talk to your doctor soon", tone: "red" },
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown; error?: unknown };
    const d = j.detail ?? j.error;
    if (typeof d === "string") return d;
  } catch {
    // not JSON
  }
  return res.status >= 500 ? "The medicine checker is unavailable. Please try again in a minute." : fallback;
}

export async function searchMedicines(q: string, signal?: AbortSignal): Promise<MedSuggestion[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`${apiBaseUrl()}/api/meds/search?q=${encodeURIComponent(q.trim())}`, { signal });
  if (!res.ok) return [];
  return ((await res.json()) as { results: MedSuggestion[] }).results ?? [];
}

export async function checkMedicines(medicines: MedicineEntry[], pregnancyMonth: number | null): Promise<MedCheckResult> {
  const body = {
    medicines: medicines
      .filter((m) => m.name.trim())
      .slice(0, 30)
      .map((m) => ({ name: m.name.trim().slice(0, 200), dose: m.dose?.trim() || null, frequency: m.frequency?.trim() || null })),
    pregnancy_month: pregnancyMonth,
  };
  const res = await fetch(`${apiBaseUrl()}/api/meds/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res, "Couldn't check these medicines."));
  return (await res.json()) as MedCheckResult;
}

/** Medicines read from a scanned prescription, ready to check. */
export function medicinesFromReport(extracted: unknown): MedicineEntry[] {
  const report = normalizeReport(extracted);
  return (report?.medications ?? []).map((m) => ({ name: m.name, dose: m.dose ?? null, frequency: m.frequency ?? null }));
}

const SEVERITY: Record<MedStatus, Severity> = { ok: "normal", caution: "attention", avoid: "urgent" };

export function medCheckRecord(result: MedCheckResult): NewRecord {
  const names = result.medicines.map((m) => m.label).slice(0, 4).join(", ");
  return {
    kind: "med_check",
    title: `Medicine check${result.pregnancy_month ? ` · month ${result.pregnancy_month}` : ""}`,
    summary: `${result.headline} ${names ? `(${names}${result.medicines.length > 4 ? "…" : ""})` : ""}`.trim(),
    severity: SEVERITY[result.status],
    data: { result } as unknown as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------------------------- My medicines

export async function listMyMedicines(patientId: string): Promise<PatientMedication[]> {
  const { data, error } = await requireSupabase()
    .from("patient_medications")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PatientMedication[];
}

export async function addMyMedicines(patientId: string, entries: MedicineEntry[], source: "manual" | "prescription"): Promise<PatientMedication[]> {
  const rows = entries
    .filter((e) => e.name.trim())
    .map((e) => ({ patient_id: patientId, name: e.name.trim().slice(0, 200), dose: e.dose?.trim().slice(0, 100) || null, frequency: e.frequency?.trim().slice(0, 100) || null, source }));
  if (!rows.length) return [];
  const { data, error } = await requireSupabase().from("patient_medications").insert(rows).select("*");
  if (error) throw error;
  notifyCareChanged();
  return (data ?? []) as PatientMedication[];
}

export async function updateMyMedicine(id: string, patch: Partial<MedicineEntry>): Promise<void> {
  const { error } = await requireSupabase().from("patient_medications").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMyMedicine(id: string): Promise<void> {
  const { error } = await requireSupabase().from("patient_medications").delete().eq("id", id);
  if (error) throw error;
  notifyCareChanged();
}
