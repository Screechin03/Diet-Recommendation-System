"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { Recipe } from "@/lib/types";
import { recipeImageCandidates } from "@/lib/utils";

function fmtNum(n: unknown, digits = 0): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(digits);
}

interface RecipeCardProps {
  recipe: Recipe;
  onSave?: (recipe: Recipe) => void | Promise<void>;
  isSaving?: boolean;
  isSaved?: boolean;
}

export function RecipeCard({ recipe, onSave, isSaving = false, isSaved = false }: RecipeCardProps) {
  const strictRecipeImages = (process.env.NEXT_PUBLIC_STRICT_RECIPE_IMAGES ?? "true") !== "false";
  const candidates = useMemo(
    () => recipeImageCandidates(recipe.Name, recipe.RecipeIngredientParts ?? []),
    [recipe.Name, recipe.RecipeIngredientParts],
  );
  const [resolved, setResolved] = useState<{ name: string; src: string | null; source: string | null }>(() => ({
    name: recipe.Name,
    src: null,
    source: null,
  }));
  const [fallback, setFallback] = useState<{ name: string; index: number }>(() => ({
    name: recipe.Name,
    index: 0,
  }));

  const resolvedSrc = resolved.name === recipe.Name ? resolved.src : null;
  const resolvedSource = resolved.name === recipe.Name ? resolved.source : null;
  const imageIndex = fallback.name === recipe.Name ? fallback.index : 0;

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({
      name: recipe.Name,
      ingredients: (recipe.RecipeIngredientParts ?? []).join(","),
    });

    fetch(`/api/recipe_image?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { imageUrl?: string | null; source?: string | null };
        return { imageUrl: data.imageUrl ?? null, source: data.source ?? null };
      })
      .then((result) => {
        if (!cancelled && result?.imageUrl) {
          setResolved({ name: recipe.Name, src: result.imageUrl, source: result.source ?? null });
          setFallback({ name: recipe.Name, index: 0 });
        } else if (!cancelled) {
          setResolved({ name: recipe.Name, src: null, source: null });
          setFallback({ name: recipe.Name, index: 0 });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolved({ name: recipe.Name, src: null, source: null });
          setFallback({ name: recipe.Name, index: 0 });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [recipe.Name, recipe.RecipeIngredientParts]);

  const src = strictRecipeImages
    ? (resolvedSrc ?? "/recipe-placeholder.svg")
    : (resolvedSrc ?? candidates[imageIndex] ?? "/recipe-placeholder.svg");

  function onImageError() {
    if (resolvedSrc) {
      setResolved({ name: recipe.Name, src: null, source: null });
      if (strictRecipeImages) return;
      return;
    }

    if (strictRecipeImages) return;

    setFallback((prev) => {
      const currentIndex = prev.name === recipe.Name ? prev.index : 0;
      const nextIndex = currentIndex < candidates.length - 1 ? currentIndex + 1 : candidates.length;
      return { name: recipe.Name, index: nextIndex };
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative h-44 w-full bg-zinc-100 dark:bg-zinc-900">
        <Image
          src={src}
          alt={recipe.Name}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 33vw"
          unoptimized
          onError={onImageError}
        />
        {resolvedSource ? (
          <div className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white">
            {resolvedSource.startsWith("gemini-generated") ? "Gemini" : "Fallback"}
          </div>
        ) : null}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold leading-snug">{recipe.Name}</h3>
          <div className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {fmtNum(recipe.Calories, 0)} kcal
          </div>
        </div>

        {recipe.pregnancy_benefits?.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-emerald-700 dark:text-emerald-300">
            {recipe.pregnancy_benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900/40">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Protein
            </div>
            <div className="font-medium">{fmtNum(recipe.ProteinContent, 1)} g</div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900/40">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Carbs
            </div>
            <div className="font-medium">{fmtNum(recipe.CarbohydrateContent, 1)} g</div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900/40">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Fat
            </div>
            <div className="font-medium">{fmtNum(recipe.FatContent, 1)} g</div>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900/40">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Fiber
            </div>
            <div className="font-medium">{fmtNum(recipe.FiberContent, 1)} g</div>
          </div>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Ingredients & instructions
          </summary>
          <div className="mt-3 grid gap-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Ingredients
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                {recipe.RecipeIngredientParts?.map((ing, idx) => (
                  <li key={`${ing}-${idx}`}>{ing}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Instructions
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                {recipe.RecipeInstructions?.map((step, idx) => (
                  <li key={`${idx}-${step.slice(0, 24)}`}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </details>

        {onSave ? (
          <button
            onClick={() => onSave(recipe)}
            disabled={isSaving}
            className="mt-4 h-9 rounded-lg border border-zinc-200 px-3 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {isSaved ? "Saved" : isSaving ? "Saving..." : "Save recipe"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
