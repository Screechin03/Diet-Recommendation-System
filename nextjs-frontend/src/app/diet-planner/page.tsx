"use client";

import { useMemo, useState } from "react";
import type { PredictionIn, PredictionOut, PregnancyInfo, Recipe } from "@/lib/types";
import { parseCsvList, safeJson } from "@/lib/utils";
import { RecipeCard } from "@/components/RecipeCard";

const inputClass =
  "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";
const textAreaClass =
  "min-h-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700";

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

export default function DietPlannerPage() {
  const [pregnancy, setPregnancy] = useState<PregnancyInfo>(() => defaultPregnancyInfo());
  const [ingredientsCsv, setIngredientsCsv] = useState<string>("");
  const [neighbors, setNeighbors] = useState<number>(5);
  const [useGemini, setUseGemini] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [refined, setRefined] = useState<any>(null);

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Diet Planner</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            Fill your pregnancy profile and get pregnancy-safe recipe recommendations.
          </p>
        </div>
        <button
          onClick={submit}
          disabled={loading}
          className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {loading ? "Generating…" : "Generate"}
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
                    setPregnancy((p) => ({ ...p, activity_level: e.target.value as any }))
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

            <label className="grid gap-1">
              <span className="text-sm font-medium">Dietary restrictions</span>
              <textarea
                className={textAreaClass}
                placeholder="Vegan, Gluten-free, Dairy-free"
                value={(pregnancy.dietary_restrictions ?? []).join(", ")}
                onChange={(e) =>
                  setPregnancy((p) => ({
                    ...p,
                    dietary_restrictions: parseCsvList(e.target.value),
                  }))
                }
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Comma-separated. Matches backend filters (e.g. Vegan/Vegetarian/Gluten-free/Dairy-free/Nut-free).
              </span>
            </label>

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

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4">
          {refined ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-base font-semibold">{String(refined.title ?? "Refined summary")}</div>
              {refined.summary ? (
                <p className="mt-2 text-zinc-700 dark:text-zinc-300">{String(refined.summary)}</p>
              ) : null}
              {Array.isArray(refined.bullets) && refined.bullets.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                  {refined.bullets.slice(0, 10).map((b: any, idx: number) => (
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
              No recipes returned. Try removing restrictions or using fewer ingredients.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recipes.map((r) => (
                <RecipeCard key={r.Name} recipe={r} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
