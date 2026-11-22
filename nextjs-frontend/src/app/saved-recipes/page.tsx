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
import { PageIntro } from "@/components/PageIntro";

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
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60">
          <h1 className="text-2xl font-semibold tracking-tight">Saved recipes</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Log in to view and manage your saved recipes.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/login" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
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
<PageIntro eyebrow="Saved" title="Saved recipes" subtitle="Meals you’ve kept for later." icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden><path d="M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 7.5 6z" /></svg>} />
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {records === null && !error ? (
        <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">Loading saved recipes...</div>
      ) : (records ?? []).length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10 p-10 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
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
