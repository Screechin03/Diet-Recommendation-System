"use client";

import type { DietInstructions } from "@/lib/care";

/** The doctor's diet instructions as a compact list (patient care page and doctor's diet tab). */
export function DietSummary({ d }: { d: DietInstructions }) {
  return (
    <dl className="mt-3 space-y-2 text-sm">
      {d.restrictions.length ? (
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Diet</dt><dd className="capitalize">{d.restrictions.join(", ")}</dd></div>
      ) : null}
      {d.avoid.length ? (
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-rose-600">Avoid</dt><dd>{d.avoid.join(", ")}</dd></div>
      ) : null}
      {d.include.length ? (
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Include</dt><dd>{d.include.join(", ")}</dd></div>
      ) : null}
      {d.note ? <p className="rounded-xl bg-zinc-50 p-3 italic text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">“{d.note}”</p> : null}
    </dl>
  );
}
