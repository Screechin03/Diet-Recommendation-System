"use client";

import Image from "next/image";
import type { Recipe } from "@/lib/types";
import { recipeImageUrl } from "@/lib/utils";

function fmtNum(n: unknown, digits = 0): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(digits);
}

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const img = recipeImageUrl(recipe.Name);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative h-44 w-full bg-zinc-100 dark:bg-zinc-900">
        <Image
          src={img}
          alt={recipe.Name}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 33vw"
          unoptimized
        />
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
      </div>
    </div>
  );
}
