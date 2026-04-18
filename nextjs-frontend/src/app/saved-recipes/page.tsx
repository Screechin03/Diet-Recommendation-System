"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RecipeCard } from "@/components/RecipeCard";
import { useAuth } from "@/components/AuthProvider";
import {
  getSavedRecipesForUser,
  removeSavedRecipeForUser,
  type SavedRecipeRow,
} from "@/lib/supabaseUserData";

export default function SavedRecipesPage() {
  const { user, loading } = useAuth();
  const [records, setRecords] = useState<SavedRecipeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    getSavedRecipesForUser(user.id)
      .then((rows) => {
        if (!cancelled) setRecords(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load saved recipes");
        }
      })
      .finally(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function removeRecipe(savedRecipeId: string) {
    if (!user) return;

    try {
      await removeSavedRecipeForUser(user.id, savedRecipeId);
      setRecords((prev) => (prev ?? []).filter((item) => item.id !== savedRecipeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove saved recipe");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-zinc-600 dark:text-zinc-300">
        Checking session...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold tracking-tight">Saved recipes</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Log in to view and manage your saved recipes.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/login" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
              Log in
            </Link>
            <Link href="/signup" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saved recipes</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Recipes you bookmarked while exploring recommendations.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {records === null && !error ? (
        <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">Loading saved recipes...</div>
      ) : (records ?? []).length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-10 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          No saved recipes yet. Use Save recipe from Diet Planner or Recipe Finder.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(records ?? []).map((item) => (
            <div key={item.id} className="grid gap-3">
              <RecipeCard recipe={item.recipe} />
              <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-zinc-600 dark:text-zinc-300">
                  Saved {new Date(item.created_at).toLocaleString()}
                </div>
                <button
                  onClick={() => removeRecipe(item.id)}
                  className="rounded-md border border-zinc-200 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
