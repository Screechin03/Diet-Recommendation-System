"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RecipeCard } from "@/components/RecipeCard";
import { useAuth } from "@/components/AuthProvider";
import { getRecipeHistoryForUser, type RecipeHistoryRow } from "@/lib/supabaseUserData";

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const [records, setRecords] = useState<RecipeHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    getRecipeHistoryForUser(user.id)
      .then((rows) => {
        if (!cancelled) setRecords(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load recommendation history");
        }
      })
      .finally(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user]);

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
          <h1 className="text-2xl font-semibold tracking-tight">Recipe history</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Log in to see recommendations generated from your previous searches.
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
          <h1 className="text-2xl font-semibold tracking-tight">Recipe history</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Every recipe returned from your planner/finder searches.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {records === null && !error ? (
        <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">Loading history...</div>
      ) : (records ?? []).length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-10 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          No history yet. Generate recipes from Diet Planner or Recipe Finder while logged in.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(records ?? []).map((item) => (
            <div key={item.id} className="grid gap-3">
              <RecipeCard recipe={item.recipe} />
              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                Source: {item.source_page} | {new Date(item.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
