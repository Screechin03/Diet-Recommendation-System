import "expo-sqlite/localStorage/install";
// Daily meal plans (FastAPI /meal-plan via the website's /api/meal-plan): five meals a day, optimised for the
// trimester's targets, adjusted for the latest vitals and the medicines the patient takes.
import { apiBaseUrl } from "./api";
import { listRecordsOfKind } from "./care";
import { listMyMedicines } from "./meds";
import type { PregnancyInfo, Recipe } from "./types";
import type { VitalsAnalysis } from "./vitals";

export type Slot = "breakfast" | "lunch" | "dinner" | "snack_am" | "snack_pm";
export type NutrientKey = "energy_kcal" | "protein_g" | "fiber_g" | "iron_mg" | "folate_ug" | "calcium_mg" | "sodium_mg" | "satfat_g" | "sugar_g" | "carbs_g" | "fiber_cap_g";

export interface PlanRecipe extends Recipe {
  RecipeId: number;
  estimated: { iron_mg: number; folate_ug: number; calcium_mg: number };
  estimate_coverage_pct: number;
}
export interface PlanMeal {
  slot: Slot;
  label: string;
  recipe: PlanRecipe;
}
export interface AiMeal {
  slot: Slot;
  name: string;
  ingredients: string[];
  steps: string[];
  kcal: number;
  protein_g: number;
}
export interface Coverage {
  value: number;
  target: number;
  kind: "min" | "max" | "range";
  pct: number;
  met: boolean;
}
export interface PlanDay {
  day: number;
  meals: PlanMeal[];
  /** Meals swapped by the last adjustment (with what they replaced). */
  changed?: Array<{ slot: Slot; removed: string | null }>;
  ai_meals?: AiMeal[];
  totals: Record<string, number>;
  coverage: Partial<Record<NutrientKey, Coverage>>;
  targets_met: number;
  targets_total: number;
  summary?: string | null;
}
export interface MealPlan {
  seed: number;
  source: "optimiser" | "ai";
  targets: { energy_kcal: number; minimums: Record<string, number>; maximums: Record<string, number> };
  days: PlanDay[];
  context: string[];
  method: { name: string };
  notes: string[];
  reviewed_by?: "gemini" | "rules";
}
export interface VitalsContext {
  recorded_at: string;
  status?: string;
  hr_avg?: number | null;
  spo2_avg?: number | null;
  temp_avg?: number | null;
  activity?: string;
}
export interface PlanContext {
  vitals: VitalsContext | null;
  medicines: string[];
}
export interface SwapOption {
  meal: PlanMeal;
  targets_met: number;
  coverage: PlanDay["coverage"];
  totals: Record<string, number>;
}
interface ReviewDay {
  day: number;
  replacements: Array<{ slot: Slot; issue: string; removed: string; meal: PlanMeal }>;
  summary: string | null;
  coverage: PlanDay["coverage"];
  totals: Record<string, number>;
  targets_met: number;
}

export const NUTRIENT_COPY: Record<NutrientKey, { label: string; unit: string; estimated?: boolean }> = {
  energy_kcal: { label: "Energy", unit: "kcal" },
  protein_g: { label: "Protein", unit: "g" },
  fiber_g: { label: "Fibre", unit: "g" },
  iron_mg: { label: "Iron", unit: "mg", estimated: true },
  folate_ug: { label: "Folate", unit: "µg", estimated: true },
  calcium_mg: { label: "Calcium", unit: "mg", estimated: true },
  sodium_mg: { label: "Sodium", unit: "mg" },
  satfat_g: { label: "Sat. fat", unit: "g" },
  sugar_g: { label: "Sugar", unit: "g" },
  carbs_g: { label: "Carbs", unit: "g" },
  fiber_cap_g: { label: "Fibre (max)", unit: "g" },
};
export const SLOT_ORDER: Slot[] = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];
export const SLOT_TIME: Record<Slot, string> = { breakfast: "8:00", snack_am: "11:00", lunch: "13:30", snack_pm: "17:00", dinner: "20:00" };
export const SLOT_LABEL: Record<Slot, string> = { breakfast: "Breakfast", snack_am: "Morning snack", lunch: "Lunch", snack_pm: "Evening snack", dinner: "Dinner" };

async function post<T>(path: string, body: unknown, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      // not JSON
    }
    if (!res.ok) {
      const d = data as { detail?: unknown; error?: unknown } | null;
      const msg = d?.detail ?? d?.error;
      throw new Error(typeof msg === "string" ? msg : `Request failed (${res.status})`);
    }
    return data as T;
  } catch (e) {
    if (controller.signal.aborted) throw new Error("The planner took too long. Please try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Latest real vitals (not samples) and the patient's medicine list. Missing pieces are simply left out. */
export async function loadPlanContext(userId: string | null): Promise<PlanContext> {
  if (!userId) return { vitals: null, medicines: [] };
  const [records, meds] = await Promise.all([
    listRecordsOfKind(userId, "vitals", 5).catch(() => []),
    listMyMedicines(userId).catch(() => []),
  ]);
  const latest = records.find((r) => !(r as { is_sample?: boolean }).is_sample);
  let vitals: VitalsContext | null = null;
  if (latest) {
    const a = latest.data as unknown as Partial<VitalsAnalysis>;
    vitals = {
      recorded_at: latest.created_at,
      status: a.status,
      hr_avg: a.metrics?.heart_rate?.avg ?? null,
      spo2_avg: a.metrics?.spo2?.avg ?? null,
      temp_avg: a.metrics?.temperature?.avg ?? null,
      activity: a.session?.activity,
    };
  }
  return { vitals, medicines: meds.map((m) => [m.name, m.dose].filter(Boolean).join(" ")).filter(Boolean) };
}

export function vitalsContextFrom(a: VitalsAnalysis): VitalsContext {
  return {
    recorded_at: a.analyzed_at,
    status: a.status,
    hr_avg: a.metrics.heart_rate?.avg ?? null,
    spo2_avg: a.metrics.spo2?.avg ?? null,
    temp_avg: a.metrics.temperature?.avg ?? null,
    activity: a.session.activity,
  };
}

export function getMealPlan(info: PregnancyInfo, days: number, context: PlanContext): Promise<MealPlan> {
  return post<MealPlan>("/api/meal-plan", { pregnancy_info: info, days, vitals: context.vitals, medicines: context.medicines });
}

export function getSwaps(info: PregnancyInfo, day: PlanDay, slot: Slot): Promise<{ options: SwapOption[] }> {
  const meals = Object.fromEntries(day.meals.map((m) => [m.slot, m.recipe.RecipeId]));
  return post("/api/meal-plan/swap", { pregnancy_info: info, meals, slot });
}

/** Second opinion (rules + Gemini). Returns the plan with flagged meals already replaced and the summaries. */
export async function reviewMealPlan(info: PregnancyInfo, plan: MealPlan): Promise<{ plan: MealPlan; replaced: string[] }> {
  if (plan.source !== "optimiser") return { plan, replaced: [] };
  const days = plan.days.map((d) => Object.fromEntries(d.meals.map((m) => [m.slot, m.recipe.RecipeId])));
  const res = await post<{ reviewed_by: "gemini" | "rules"; days: ReviewDay[] }>("/api/meal-plan/review", { pregnancy_info: info, days, context: plan.context }, 45_000);
  const replaced: string[] = [];
  const next = plan.days.map((d, i) => {
    const r = res.days[i];
    if (!r) return d;
    let meals = d.meals;
    for (const rep of r.replacements) {
      meals = meals.map((m) => (m.slot === rep.slot ? rep.meal : m));
      replaced.push(`${rep.removed}: ${rep.issue}`);
    }
    return r.replacements.length
      ? { ...d, meals, coverage: r.coverage, totals: r.totals, targets_met: r.targets_met, summary: r.summary }
      : { ...d, summary: r.summary };
  });
  return { plan: { ...plan, days: next, reviewed_by: res.reviewed_by }, replaced };
}

export function applySwap(day: PlanDay, option: SwapOption): PlanDay {
  return { ...day, meals: day.meals.map((m) => (m.slot === option.meal.slot ? option.meal : m)), coverage: option.coverage, totals: option.totals, targets_met: option.targets_met };
}

// ---------------------------------------------------------------------------------------------------------
// The current plan is kept on this device, so a week's plan stays between visits and can be adjusted
// (rather than replaced) when fresh vitals or medicines come in.
// ---------------------------------------------------------------------------------------------------------

const CURRENT_KEY = "mamacare.currentPlan.v1";

export interface SavedPlan {
  plan: MealPlan;
  info: PregnancyInfo;
  savedAt: string; // when day 1 started
}

export function saveCurrentPlan(plan: MealPlan, info: PregnancyInfo, savedAt?: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify({ plan, info, savedAt: savedAt ?? new Date().toISOString() }));
  } catch {
    // storage unavailable: the plan just isn't remembered
  }
}

export function loadCurrentPlan(): SavedPlan | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    const saved = raw ? (JSON.parse(raw) as SavedPlan) : null;
    if (!saved?.plan?.days?.length) return null;
    const ageDays = (Date.now() - new Date(saved.savedAt).getTime()) / 86_400_000;
    return ageDays < saved.plan.days.length + 1 ? saved : null; // a finished plan is no longer "current"
  } catch {
    return null;
  }
}

/** Index of today's day in a plan that started at `savedAt`. */
export function todayIndex(saved: Pick<SavedPlan, "savedAt" | "plan">): number {
  const d = Math.floor((Date.now() - new Date(saved.savedAt).getTime()) / 86_400_000);
  return Math.max(0, Math.min(d, saved.plan.days.length - 1));
}

/** Keep the plan, swap at most `maxChanges` meals a day from today on, to fit fresh vitals / medicines. */
export async function adjustMealPlan(saved: SavedPlan, context: PlanContext, maxChanges = 2): Promise<{ plan: MealPlan; changes: number }> {
  const from = todayIndex(saved);
  const days = saved.plan.days.slice(from).map((d) => Object.fromEntries(d.meals.map((m) => [m.slot, m.recipe.RecipeId])));
  const res = await post<{
    context: string[];
    notes: string[];
    days: Array<{ day: number; unchanged?: boolean; meals?: PlanMeal[]; changed: Array<{ slot: Slot; removed: string | null }>; coverage?: PlanDay["coverage"]; totals?: Record<string, number>; targets_met?: number; targets_total?: number }>;
  }>("/api/meal-plan/adjust", { pregnancy_info: saved.info, days, vitals: context.vitals, medicines: context.medicines, max_changes: maxChanges });
  let changes = 0;
  const next = saved.plan.days.map((d, i) => {
    const r = i >= from ? res.days[i - from] : undefined;
    if (!r || r.unchanged || !r.meals) return { ...d, changed: undefined };
    changes += r.changed.length;
    return { ...d, meals: r.meals, coverage: r.coverage ?? d.coverage, totals: r.totals ?? d.totals, targets_met: r.targets_met ?? d.targets_met, targets_total: r.targets_total ?? d.targets_total, changed: r.changed };
  });
  return { plan: { ...saved.plan, days: next, context: res.context, notes: res.notes }, changes };
}
