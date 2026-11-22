"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useLiveData } from "@/components/care/hooks";
import { ShareWithDoctor } from "@/components/care/ShareWithDoctor";
import { doctorName, getDietInstructions, hasDietInstructions, savePatientProfile, type DietInstructions } from "@/lib/care";
import { dietPlanRecord } from "@/lib/careRecords";
import type { PredictionIn, PredictionOut, PregnancyInfo, Recipe } from "@/lib/types";
import { parseCsvList, safeJson } from "@/lib/utils";
import { RecipeCard } from "@/components/RecipeCard";
import { useAuth } from "@/components/AuthProvider";
import {
  recordRecipeHistoryForUser,
  saveRecipeForUser,
} from "@/lib/supabaseUserData";
import { DietaryRestrictionsChecklist } from "@/components/DietaryRestrictionsChecklist";
import { PageIntro } from "@/components/PageIntro";
import { DayPlanView } from "@/components/mealplan/DayPlanView";
import {
  HANDOFF_KEY,
  adjustMealPlan,
  getMealPlan,
  loadCurrentPlan,
  loadPlanContext,
  reviewMealPlan,
  saveCurrentPlan,
  todayIndex,
  type MealPlan,
  type PlanHandoff,
} from "@/lib/mealPlan";

const inputClass =
  "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";
const textAreaClass =
  "min-h-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";

interface RefinedSummary {
  title?: string;
  summary?: string;
  bullets?: string[];
}

function defaultPregnancyInfo(): PregnancyInfo {
  return {
    pregnancy_month: 4,
    age: 28,
    pre_pregnancy_weight: 60,
    current_weight: 64,
    height: 165,
    has_gestational_diabetes: false,
    has_anemia: false,
    has_morning_sickness: false,
    has_heartburn: false,
    has_constipation: false,
    medications: [],
    food_aversions: [],
    food_cravings: [],
    dietary_restrictions: [],
    activity_level: "moderate",
  };
}

/** Lower-cased union of two lists, keeping order. */
function union(a: string[] | undefined, b: string[] | undefined): string[] {
  return Array.from(new Set([...(a ?? []), ...(b ?? [])].map((x) => x.trim().toLowerCase()).filter(Boolean)));
}

export default function DietPlannerPage() {
  const { user, role, account, careAvailable } = useAuth();
  const isPatient = Boolean(user) && role === "patient" && careAvailable;
  const [pregnancy, setPregnancy] = useState<PregnancyInfo>(() => defaultPregnancyInfo());
  // Start from the profile saved last time (also what the patient's doctor sees).
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const savedInfo = account?.patient?.info;
  if (user && savedInfo && prefilledFor !== user.id) {
    setPrefilledFor(user.id);
    if (Object.keys(savedInfo).length) setPregnancy((p) => ({ ...p, ...savedInfo }));
  }

  const [doctorDiet, setDoctorDiet] = useState<DietInstructions | null>(null);
  const loadDoctorDiet = useCallback(async () => {
    if (!user || !isPatient) return;
    try {
      setDoctorDiet(await getDietInstructions(user.id));
    } catch {
      // Planner works without them.
    }
  }, [user, isPatient]);
  useLiveData(loadDoctorDiet, 60_000);
  const di = hasDietInstructions(doctorDiet) ? doctorDiet : null;
  const [lastRun, setLastRun] = useState<{ id: number; request: PredictionIn; meta: PredictionOut["meta"] | null; di: DietInstructions | null } | null>(null);
  const [mode, setMode] = useState<"day" | "recipes">("day");
  // Readings / medicines handed over from the vitals or medicine page (browser-only, so read as an external store).
  const handoffRaw = useSyncExternalStore(
    () => () => undefined,
    () => {
      try {
        return sessionStorage.getItem(HANDOFF_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const handoff = useMemo<PlanHandoff | null>(() => {
    try {
      return handoffRaw ? (JSON.parse(handoffRaw) as PlanHandoff) : null;
    } catch {
      return null;
    }
  }, [handoffRaw]);
  const [planDays, setPlanDays] = useState<1 | 7>(1);
  const [plan, setPlan] = useState<{ id: number; value: MealPlan; info: PregnancyInfo; di: DietInstructions | null; savedAt: string } | null>(null);
  const [adjustNote, setAdjustNote] = useState<string | null>(null);
  // Is there a plan saved on this device? (browser-only, read as an external store)
  const hasSavedPlan = useSyncExternalStore(
    () => () => undefined,
    () => {
      try {
        return Boolean(localStorage.getItem("mamacare.currentPlan.v1"));
      } catch {
        return false;
      }
    },
    () => false,
  );

  /** Keep the plan on screen and on this device. */
  function showPlan(next: { id: number; value: MealPlan; info: PregnancyInfo; di: DietInstructions | null; savedAt: string }) {
    setPlan(next);
    saveCurrentPlan(next.value, next.info, next.savedAt);
  }

  function openSavedPlan() {
    const saved = loadCurrentPlan();
    if (!saved) {
      setError("Your last plan has finished. Make a new one.");
      return;
    }
    setPlan({ id: (plan?.id ?? 0) + 1, value: saved.plan, info: saved.info, di, savedAt: saved.savedAt });
    setMode("day");
  }

  /** Fresh vitals / medicines: adjust the current plan (at most 2 swaps a day) instead of replacing it. */
  async function adjustPlan() {
    const saved = plan ? { plan: plan.value, info: plan.info, savedAt: plan.savedAt } : loadCurrentPlan();
    if (!saved) return;
    setPlanLoading(true);
    setError(null);
    try {
      const stored = await loadPlanContext(isPatient && user ? user.id : null);
      const context = { vitals: handoff?.vitals ?? stored.vitals, medicines: Array.from(new Set([...(handoff?.medicines ?? []), ...stored.medicines])) };
      const { plan: adjusted, changes } = await adjustMealPlan(saved, context);
      showPlan({ id: (plan?.id ?? 0) + 1, value: adjusted, info: saved.info, di, savedAt: saved.savedAt });
      setAdjustNote(
        changes
          ? `${changes} meal${changes === 1 ? "" : "s"} changed from day ${todayIndex(saved) + 1} on; everything else stays as planned.`
          : "Your plan already fits these readings: nothing needed to change.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not adjust the plan");
    } finally {
      setPlanLoading(false);
    }
  }
  const [planLoading, setPlanLoading] = useState(false);
  const [ingredientsCsv, setIngredientsCsv] = useState<string>("");
  const [neighbors, setNeighbors] = useState<number>(5);
  const [useGemini, setUseGemini] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [refined, setRefined] = useState<RefinedSummary | null>(null);
  const [savingRecipeName, setSavingRecipeName] = useState<string | null>(null);
  const [savedByName, setSavedByName] = useState<Record<string, boolean>>({});

  // The doctor's instructions are always applied on top of what the patient entered.
  const requestBody = useMemo<PredictionIn>(() => {
    return {
      pregnancy_info: di
        ? {
            ...pregnancy,
            food_aversions: union(pregnancy.food_aversions, di.avoid),
            dietary_restrictions: union(pregnancy.dietary_restrictions, di.restrictions),
          }
        : pregnancy,
      ingredients: di ? union(parseCsvList(ingredientsCsv), di.include) : parseCsvList(ingredientsCsv),
      params: { n_neighbors: neighbors, return_distance: false },
    };
  }, [pregnancy, ingredientsCsv, neighbors, di]);

  async function makePlan() {
    setPlanLoading(true);
    setError(null);
    try {
      const info = requestBody.pregnancy_info;
      const saved = await loadPlanContext(isPatient && user ? user.id : null);
      const context = {
        vitals: handoff?.vitals ?? saved.vitals,
        medicines: Array.from(new Set([...(handoff?.medicines ?? []), ...saved.medicines])),
      };
      const value = await getMealPlan(info, planDays, context);
      const id = (plan?.id ?? 0) + 1;
      const savedAt = new Date().toISOString();
      showPlan({ id, value, info, di, savedAt });
      setAdjustNote(null);
      if (user && isPatient) savePatientProfile(user.id, pregnancy).catch(() => undefined);
      // Real-time plan first; the AI review (hidden ingredients, pregnancy safety, summary) follows.
      reviewMealPlan(info, value)
        .then((reviewed) =>
          setPlan((p) => {
            if (!p || p.id !== id) return p;
            saveCurrentPlan(reviewed, p.info, p.savedAt);
            return { ...p, value: reviewed };
          }),
        )
        .catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make a plan");
    } finally {
      setPlanLoading(false);
    }
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setRecipes(null);
    setRefined(null);

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = await safeJson<PredictionOut>(res);
      setRecipes(data.output ?? null);
      setSavedByName({});
      setLastRun((prev) => ({ id: (prev?.id ?? 0) + 1, request: requestBody, meta: data.meta ?? null, di }));
      if (user && isPatient) {
        // Keep the profile the doctor sees up to date (what the patient entered, without the doctor's additions).
        savePatientProfile(user.id, pregnancy).catch(() => {
          // Not critical for the plan itself.
        });
      }

      if (user && data.output && data.output.length) {
        recordRecipeHistoryForUser(user.id, "diet-planner", data.output).catch(() => {
          // Keep recommendation flow responsive if history insert fails.
        });
      }

      if (useGemini && data.output && data.output.length) {
        const refinePayload = {
          pregnancy_info: requestBody.pregnancy_info,
          ingredients: requestBody.ingredients,
          recipes: data.output.slice(0, Math.min(5, data.output.length)).map((r) => ({
            Name: r.Name,
            Calories: r.Calories,
            ProteinContent: r.ProteinContent,
            CarbohydrateContent: r.CarbohydrateContent,
            FatContent: r.FatContent,
            FiberContent: r.FiberContent,
            pregnancy_benefits: r.pregnancy_benefits ?? [],
            RecipeIngredientParts: r.RecipeIngredientParts?.slice(0, 12) ?? [],
          })),
        };

        const refineRes = await fetch("/api/refine", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "recipes", payload: refinePayload }),
        });

        if (refineRes.ok) {
          const refineJson = await refineRes.json();
          setRefined(refineJson.refined);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRecipe(recipe: Recipe) {
    if (!user) {
      setError("Log in first to save recipes.");
      return;
    }

    setSavingRecipeName(recipe.Name);
    setError(null);

    try {
      await saveRecipeForUser(user.id, recipe);
      setSavedByName((prev) => ({ ...prev, [recipe.Name]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save recipe");
    } finally {
      setSavingRecipeName(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
<PageIntro eyebrow="Diet plan" title="Meals for your month" subtitle="Tell us about your pregnancy and get pregnancy-safe recipes matched to it." icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M8 20h8M12 4c1 1.2 1 2.3 0 3.5M8.5 5c.8 1 .8 2 0 3M15.5 5c.8 1 .8 2 0 3" /></svg>} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800" role="tablist" aria-label="Planner mode">
            {([
              ["day", "Day plan"],
              ["recipes", "Recipe ideas"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  mode === value ? "bg-white text-emerald-700 shadow-soft dark:bg-zinc-900 dark:text-emerald-400" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={mode === "day" ? makePlan : submit}
            disabled={mode === "day" ? planLoading : loading}
            className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lift transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {mode === "day" ? (planLoading ? "Planning…" : plan ? "New plan" : "Plan my day") : loading ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {handoff && (handoff.vitals || handoff.medicines?.length) ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          <span className="min-w-0 flex-1">
            {handoff.vitals ? "Using the vital signs you just measured" : `Planning around ${handoff.medicines?.length} medicine${handoff.medicines?.length === 1 ? "" : "s"}`}.{" "}
            {hasSavedPlan ? "Adjust your current plan (at most 2 meals a day change), or make a new one." : "Make a day plan with them."}
          </span>
          {hasSavedPlan ? (
            <button onClick={() => void adjustPlan()} disabled={planLoading} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
              {planLoading ? "Adjusting…" : "Adjust my plan"}
            </button>
          ) : null}
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem(HANDOFF_KEY);
              } catch {
                // ignore
              }
              window.location.replace("/diet-planner");
            }}
            className="text-xs font-semibold underline"
          >
            Don’t use them
          </button>
        </div>
      ) : null}

      {di ? (
        <div className="mt-6 flex flex-wrap items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{doctorName(di.updated_by_name)}’s diet instructions are applied automatically</div>
            <div className="mt-1 text-sky-900/80 dark:text-sky-200/80">
              {[
                di.restrictions.length ? `Diet: ${di.restrictions.join(", ")}` : null,
                di.avoid.length ? `Avoiding: ${di.avoid.join(", ")}` : null,
                di.include.length ? `Favouring: ${di.include.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {di.note ? <div className="mt-1 italic">“{di.note}”</div> : null}
          </div>
          <Link href="/care" className="shrink-0 text-xs font-semibold text-sky-800 underline dark:text-sky-300">My care</Link>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Pregnancy month (1-9)</span>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={9}
                  value={pregnancy.pregnancy_month}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, pregnancy_month: Number(e.target.value) }))
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Age</span>
                <input
                  className={inputClass}
                  type="number"
                  min={10}
                  max={60}
                  value={pregnancy.age}
                  onChange={(e) => setPregnancy((p) => ({ ...p, age: Number(e.target.value) }))}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Pre-pregnancy weight (kg)</span>
                <input
                  className={inputClass}
                  type="number"
                  step="0.1"
                  value={pregnancy.pre_pregnancy_weight}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, pre_pregnancy_weight: Number(e.target.value) }))
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Current weight (kg)</span>
                <input
                  className={inputClass}
                  type="number"
                  step="0.1"
                  value={pregnancy.current_weight}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, current_weight: Number(e.target.value) }))
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Height (cm)</span>
                <input
                  className={inputClass}
                  type="number"
                  step="0.1"
                  value={pregnancy.height}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, height: Number(e.target.value) }))
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Activity level</span>
                <select
                  className={inputClass}
                  value={pregnancy.activity_level ?? "moderate"}
                  onChange={(e) =>
                    setPregnancy((p) => ({
                      ...p,
                      activity_level: e.target.value as PregnancyInfo["activity_level"],
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3">
              <div className="text-sm font-semibold">Health conditions</div>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={!!pregnancy.has_gestational_diabetes}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, has_gestational_diabetes: e.target.checked }))
                  }
                />
                Gestational diabetes
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={!!pregnancy.has_anemia}
                  onChange={(e) => setPregnancy((p) => ({ ...p, has_anemia: e.target.checked }))}
                />
                Anemia
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={!!pregnancy.has_morning_sickness}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, has_morning_sickness: e.target.checked }))
                  }
                />
                Morning sickness
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={!!pregnancy.has_heartburn}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, has_heartburn: e.target.checked }))
                  }
                />
                Heartburn
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={!!pregnancy.has_constipation}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, has_constipation: e.target.checked }))
                  }
                />
                Constipation
              </label>
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-medium">Dietary restrictions</div>
              <DietaryRestrictionsChecklist
                value={pregnancy.dietary_restrictions}
                onChange={(next) =>
                  setPregnancy((p) => ({
                    ...p,
                    dietary_restrictions: next,
                  }))
                }
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                These are enforced server-side (filtering + substitutions when needed).
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Food aversions</span>
                <textarea
                  className={textAreaClass}
                  placeholder="onion, garlic"
                  value={(pregnancy.food_aversions ?? []).join(", ")}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, food_aversions: parseCsvList(e.target.value) }))
                  }
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Ingredient preferences</span>
                <textarea
                  className={textAreaClass}
                  placeholder="spinach, ginger, tofu"
                  value={ingredientsCsv}
                  onChange={(e) => setIngredientsCsv(e.target.value)}
                />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Optional. Backend will remove unsafe foods automatically.
                </span>
              </label>
            </div>

            {mode === "day" ? (
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Plan length</span>
                <div className="flex gap-2">
                  {([1, 7] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => setPlanDays(n)}
                      aria-pressed={planDays === n}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                        planDays === n ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {n === 1 ? "Today" : "A week (no repeats)"}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-zinc-500">Five meals a day, chosen together so the day meets your trimester’s targets.</span>
              </div>
            ) : (
              <>
            <label className="grid gap-1">
              <span className="text-sm font-medium">How many recipes?</span>
              <input
                className={inputClass}
                type="number"
                min={1}
                max={15}
                value={neighbors}
                onChange={(e) => setNeighbors(Number(e.target.value))}
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Uses the backend `n_neighbors` parameter.
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={useGemini}
                onChange={(e) => setUseGemini(e.target.checked)}
              />
              Refine explanation with Gemini (optional)
            </label>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Uses server-side `GEMINI_API_KEY`. Gemini won’t change recipe numbers—only adds a summary.
            </div>
              </>
            )}

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid content-start gap-4">
          {mode === "day" ? (
            planLoading && !plan ? (
              <div className="animate-pulse space-y-4" aria-label="Planning">
                <div className="h-52 rounded-3xl bg-zinc-100 dark:bg-zinc-800" />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 rounded-3xl bg-zinc-100 dark:bg-zinc-800" />
                ))}
              </div>
            ) : plan ? (
              <>
                <ShareWithDoctor
                  key={`plan-${plan.id}`}
                  what="this meal plan"
                  build={() =>
                    dietPlanRecord({
                      pregnancy_info: plan.info,
                      ingredients: [],
                      recipes: plan.value.days.flatMap((d) => d.meals.map((m) => m.recipe)),
                      meta: null,
                      refined: null,
                      meal_plan: plan.value,
                      doctor_instructions: plan.di
                        ? { avoid: plan.di.avoid, include: plan.di.include, restrictions: plan.di.restrictions, note: plan.di.note, by: plan.di.updated_by_name }
                        : null,
                    })
                  }
                />
                {adjustNote ? (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">{adjustNote}</div>
                ) : null}
                <DayPlanView key={plan.id} plan={plan.value} info={plan.info} onChange={(value) => showPlan({ ...plan, value })} />
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 p-10 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-emerald-950/10 dark:text-zinc-300">
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Your day, planned around your trimester</p>
                <p className="mt-2 max-w-md leading-6">
                  Breakfast, lunch, dinner and two snacks, chosen together from 300,000+ recipes so the day reaches your protein, fibre, iron,
                  folate and calcium targets without going over on salt, saturated fat or sugar.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={makePlan} className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lift transition hover:bg-emerald-500">
                    Plan my day
                  </button>
                  {hasSavedPlan ? (
                    <button onClick={openSavedPlan} className="h-11 rounded-xl border border-zinc-300 bg-white px-5 text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
                      Open my current plan
                    </button>
                  ) : null}
                </div>
              </div>
            )
          ) : (
          <>
          {recipes && recipes.length && lastRun ? (
            <ShareWithDoctor
              key={lastRun.id}
              what="this diet plan"
              build={() =>
                dietPlanRecord({
                  pregnancy_info: lastRun.request.pregnancy_info,
                  ingredients: lastRun.request.ingredients,
                  recipes,
                  meta: lastRun.meta,
                  refined: refined ?? null,
                  doctor_instructions: lastRun.di
                    ? {
                        avoid: lastRun.di.avoid,
                        include: lastRun.di.include,
                        restrictions: lastRun.di.restrictions,
                        note: lastRun.di.note,
                        by: lastRun.di.updated_by_name,
                      }
                    : null,
                })
              }
            />
          ) : null}
          {refined ? (
            <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 text-sm shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="text-base font-semibold">{String(refined.title ?? "Refined summary")}</div>
              {refined.summary ? (
                <p className="mt-2 text-zinc-700 dark:text-zinc-300">{String(refined.summary)}</p>
              ) : null}
              {Array.isArray(refined.bullets) && refined.bullets.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                  {refined.bullets.slice(0, 10).map((b, idx) => (
                    <li key={idx}>{String(b)}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {recipes === null ? (
            <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10 p-10 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
              Results will appear here.
            </div>
          ) : recipes.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 text-sm text-zinc-700 shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
              No recipes returned. Try removing restrictions or using fewer ingredients.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recipes.map((r) => (
                <RecipeCard
                  key={r.Name}
                  recipe={r}
                  onSave={handleSaveRecipe}
                  isSaving={savingRecipeName === r.Name}
                  isSaved={!!savedByName[r.Name]}
                />
              ))}
            </div>
          )}
          </>
          )}
        </section>
      </div>
    </div>
  );
}
