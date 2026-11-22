"use client";

import { useRouter } from "next/navigation";
import { setPlanHandoff, type PlanHandoff } from "@/lib/mealPlan";

/** "Plan meals for this": hands the readings / medicines to the day planner. */
export function PlanFromHere({ handoff, title, text }: { handoff: PlanHandoff; title: string; text: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 dark:border-emerald-900 dark:from-emerald-950/30 dark:to-zinc-900/40">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-600 text-white" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M8 20h8M12 4c1 1.2 1 2.3 0 3.5M8.5 5c.8 1 .8 2 0 3M15.5 5c.8 1 .8 2 0 3" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">{text}</div>
      </div>
      <button
        onClick={() => {
          setPlanHandoff(handoff);
          router.push("/diet-planner?from=handoff");
        }}
        className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lift transition hover:bg-emerald-500"
      >
        Plan my day
      </button>
    </div>
  );
}
