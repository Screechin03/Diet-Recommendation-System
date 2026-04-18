"use client";

import { useMemo, useState } from "react";
import type { PredictionIn, PredictionOut, PregnancyInfo, Recipe } from "@/lib/types";
import { parseCsvList, safeJson } from "@/lib/utils";
import { RecipeCard } from "@/components/RecipeCard";
import { useAuth } from "@/components/AuthProvider";
import {
  recordRecipeHistoryForUser,
  saveRecipeForUser,
} from "@/lib/supabaseUserData";
import { DietaryRestrictionsChecklist } from "@/components/DietaryRestrictionsChecklist";

const inputClass =
  "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";
const textAreaClass =
  "min-h-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";

interface RefinedSummary {
  title?: string;
  summary?: string;
  bullets?: string[];
}

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
    dietary_restrictions: [],
    food_aversions: [],
    activity_level: "moderate",
    medications: [],
    food_cravings: [],
  };
}

export default function RecipeFinderPage() {
  const { user } = useAuth();
  const [pregnancy, setPregnancy] = useState<PregnancyInfo>(() => defaultPregnancyInfo());
  const [ingredientsCsv, setIngredientsCsv] = useState<string>("chicken, spinach");
  const [neighbors, setNeighbors] = useState<number>(5);
  const [useGemini, setUseGemini] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [refined, setRefined] = useState<RefinedSummary | null>(null);
  const [savingRecipeName, setSavingRecipeName] = useState<string | null>(null);
  const [savedByName, setSavedByName] = useState<Record<string, boolean>>({});
  const [meta, setMeta] = useState<PredictionOut["meta"] | null>(null);

  const requestBody = useMemo<PredictionIn>(() => {
    return {
      pregnancy_info: pregnancy,
      ingredients: parseCsvList(ingredientsCsv),
      params: { n_neighbors: neighbors, return_distance: false },
    };
  }, [pregnancy, ingredientsCsv, neighbors]);

  async function submit() {
    setLoading(true);
    setError(null);
    setRecipes(null);
    setRefined(null);
    setMeta(null);

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

      if (user && data.output && data.output.length) {
        recordRecipeHistoryForUser(user.id, "recipe-finder", data.output).catch(() => {
          // Keep recommendation flow responsive if history insert fails.
        });
      }
      setMeta(data.meta ?? null);

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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Custom Recipe Finder</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            Focus on specific ingredients + restrictions. Uses the same FastAPI recommendation endpoint.
          </p>
        </div>
        <button
          onClick={submit}
          disabled={loading}
          className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {loading ? "Searching…" : "Find recipes"}
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-5">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Ingredient keywords</span>
              <textarea
                className={textAreaClass}
                value={ingredientsCsv}
                onChange={(e) => setIngredientsCsv(e.target.value)}
                placeholder="e.g. tofu, lentils, ginger"
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Comma-separated. The backend matches recipes containing any of the key ingredients.
              </span>
            </label>

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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Pregnancy month</span>
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

            <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <summary className="cursor-pointer text-sm font-semibold">More profile details</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Age</span>
                  <input
                    className={inputClass}
                    type="number"
                    value={pregnancy.age}
                    onChange={(e) => setPregnancy((p) => ({ ...p, age: Number(e.target.value) }))}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Height (cm)</span>
                  <input
                    className={inputClass}
                    type="number"
                    value={pregnancy.height}
                    onChange={(e) => setPregnancy((p) => ({ ...p, height: Number(e.target.value) }))}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Pre-pregnancy weight (kg)</span>
                  <input
                    className={inputClass}
                    type="number"
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
                    value={pregnancy.current_weight}
                    onChange={(e) =>
                      setPregnancy((p) => ({ ...p, current_weight: Number(e.target.value) }))
                    }
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-2">
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
                    onChange={(e) =>
                      setPregnancy((p) => ({ ...p, has_anemia: e.target.checked }))
                    }
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
              </div>

              <div className="mt-4 grid gap-1">
                <span className="text-sm font-medium">Food aversions</span>
                <textarea
                  className={textAreaClass}
                  value={(pregnancy.food_aversions ?? []).join(", ")}
                  onChange={(e) =>
                    setPregnancy((p) => ({ ...p, food_aversions: parseCsvList(e.target.value) }))
                  }
                />
              </div>
            </details>

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

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4">
          {meta?.ingredient_corrections?.length ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                Adjusted ingredient keywords
              </div>
              <div className="mt-1 text-zinc-700 dark:text-zinc-300">
                {meta.ingredient_corrections.slice(0, 6).map((c) => `${c.from} → ${c.to}`).join(", ")}
              </div>
              {meta.ingredients_used?.length ? (
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Searching with: {meta.ingredients_used.join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}

          {meta?.substitutions?.length ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                Applied dietary substitutions
              </div>
              <div className="mt-1 text-zinc-700 dark:text-zinc-300">
                {meta.substitutions.slice(0, 6).map((s) => `${s.from} → ${s.to}`).join(", ")}
              </div>
              {meta.ingredients_used?.length ? (
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Searching with: {meta.ingredients_used.join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}

          {meta?.dietary_restrictions_applied?.length ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 shadow-sm dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
              Dietary filters applied: {meta.dietary_restrictions_applied.join(", ")}
            </div>
          ) : null}

          {meta?.dietary_restrictions_applied?.includes("vegan") ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
              Vegan mode: recipes with dairy/eggs/meat are filtered out.
            </div>
          ) : null}

          {refined ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
            <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
              Results will appear here.
            </div>
          ) : recipes.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              No recipes matched those ingredients. Try a corrected spelling or different keywords.
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
        </section>
      </div>
    </div>
  );
}
