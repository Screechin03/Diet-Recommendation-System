"use client";

import { useState } from "react";
import type { PregnancyInfo } from "@/lib/types";
import {
  NUTRIENT_COPY,
  SLOT_ORDER,
  SLOT_TIME,
  applySwap,
  getSwaps,
  type Coverage,
  type MealPlan,
  type NutrientKey,
  type PlanDay,
  type PlanMeal,
  type SwapOption,
} from "@/lib/mealPlan";

const MIN_KEYS: NutrientKey[] = ["energy_kcal", "protein_g", "fiber_g", "iron_mg", "folate_ug", "calcium_mg"];
const MAX_KEYS: NutrientKey[] = ["sodium_mg", "satfat_g", "sugar_g", "carbs_g", "fiber_cap_g"];

const fmt = (n: number | undefined, d = 0) => (n == null || !Number.isFinite(n) ? "–" : n.toLocaleString(undefined, { maximumFractionDigits: d }));

function Ring({ c, label, estimated }: { c: Coverage; label: string; estimated?: boolean }) {
  const size = 72;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.min(c.pct, 100) / 100;
  const color = c.met ? "text-emerald-600 dark:text-emerald-400" : c.pct >= 70 ? "text-amber-500" : "text-rose-500";
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" className="stroke-zinc-100 dark:stroke-zinc-800" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - v)}
            className={`${color} transition-[stroke-dashoffset] duration-700`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-sm font-bold tabular-nums">{c.pct}%</div>
      </div>
      <div className="text-xs font-semibold">
        {label}
        {estimated ? <span className="text-zinc-400">*</span> : null}
      </div>
      <div className="text-[11px] tabular-nums text-zinc-500">
        {fmt(c.value)} / {fmt(c.target)}
      </div>
    </div>
  );
}

function LimitBar({ c, label }: { c: Coverage; label: string }) {
  const pct = Math.min(c.pct, 130);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className={`tabular-nums ${c.met ? "text-zinc-500" : "font-semibold text-rose-600"}`}>
          {fmt(c.value)} of max {fmt(c.target)}
        </span>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${c.met ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${(pct / 130) * 100}%` }} />
        <div className="absolute inset-y-0 w-px bg-zinc-400" style={{ left: `${(100 / 130) * 100}%` }} title="limit" />
      </div>
    </div>
  );
}

export function CoveragePanel({ day }: { day: PlanDay }) {
  return (
    <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">Day {day.day} · how it adds up</p>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            day.targets_met === day.targets_total ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          {day.targets_met} of {day.targets_total} targets met
        </span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4 sm:grid-cols-6">
        {MIN_KEYS.map((k) => (day.coverage[k] ? <Ring key={k} c={day.coverage[k]!} label={NUTRIENT_COPY[k].label} estimated={NUTRIENT_COPY[k].estimated} /> : null))}
      </div>
      <div className="mt-6 grid gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-3 dark:border-zinc-800">
        {MAX_KEYS.map((k) => (day.coverage[k] ? <LimitBar key={k} c={day.coverage[k]!} label={`${NUTRIENT_COPY[k].label} (${NUTRIENT_COPY[k].unit})`} /> : null))}
      </div>
      <p className="mt-4 text-xs text-zinc-500">* Estimated from the ingredients. Energy counts as met within 10% of the target.</p>
    </div>
  );
}

function MealCard({
  meal,
  onSwap,
  swapping,
}: {
  meal: PlanMeal;
  onSwap?: () => void;
  swapping?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const r = meal.recipe;
  return (
    <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-soft transition hover:border-emerald-200 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold leading-snug tracking-tight">{r.Name}</h4>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-semibold dark:bg-zinc-800">{fmt(r.Calories)} kcal</span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">{fmt(r.ProteinContent, 1)} g protein</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">iron {fmt(r.estimated.iron_mg, 1)} mg*</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">folate {fmt(r.estimated.folate_ug)} µg*</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">calcium {fmt(r.estimated.calcium_mg)} mg*</span>
          </div>
        </div>
        {onSwap ? (
          <button
            onClick={onSwap}
            disabled={swapping}
            className="shrink-0 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-emerald-950/30"
          >
            {swapping ? "Finding…" : "Swap"}
          </button>
        ) : null}
      </div>
      <button onClick={() => setOpen((v) => !v)} className="mt-3 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
        {open ? "Hide recipe" : "Ingredients & steps"}
      </button>
      {open ? (
        <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
          <ul className="list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
            {r.RecipeIngredientParts.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <ol className="list-decimal space-y-1.5 pl-5 text-zinc-700 dark:text-zinc-300">
            {(r.RecipeInstructions ?? []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** A plan's days, with nutrient coverage and (when `info` is given) swapping meals. */
export function DayPlanView({ plan, info, onChange }: { plan: MealPlan; info?: PregnancyInfo; onChange?: (plan: MealPlan) => void }) {
  const [dayIdx, setDayIdx] = useState(0);
  const [swap, setSwap] = useState<{ slot: string; options: SwapOption[] | null; error?: string } | null>(null);
  const day = plan.days[Math.min(dayIdx, plan.days.length - 1)];
  const meals = SLOT_ORDER.map((s) => day.meals.find((m) => m.slot === s)).filter(Boolean) as PlanMeal[];

  async function openSwap(m: PlanMeal) {
    if (!info) return;
    setSwap({ slot: m.slot, options: null });
    try {
      const res = await getSwaps(info, day, m.slot);
      setSwap({ slot: m.slot, options: res.options });
    } catch (e) {
      setSwap({ slot: m.slot, options: [], error: e instanceof Error ? e.message : "Could not load options" });
    }
  }

  function choose(option: SwapOption) {
    const days = plan.days.map((d, i) => (i === dayIdx ? applySwap(d, option) : d));
    onChange?.({ ...plan, days });
    setSwap(null);
  }

  if (plan.source === "ai") {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          No recipes in our collection fitted all your restrictions, so this day was written by the AI. Nutrients are approximate.
        </div>
        {(day.ai_meals ?? []).map((m) => (
          <div key={m.slot} className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">{m.slot.replace("_am", " (morning)").replace("_pm", " (evening)")}</p>
            <h4 className="mt-1 font-semibold">{m.name}</h4>
            <p className="text-xs text-zinc-500">≈ {Math.round(m.kcal)} kcal · {Math.round(m.protein_g)} g protein</p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{m.ingredients.join(", ")}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {plan.days.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Days">
          {plan.days.map((d, i) => (
            <button
              key={d.day}
              role="tab"
              aria-selected={i === dayIdx}
              onClick={() => {
                setDayIdx(i);
                setSwap(null);
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                i === dayIdx ? "bg-emerald-600 text-white shadow-lift" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800"
              }`}
            >
              Day {d.day}
              <span className={`ml-1.5 text-xs ${i === dayIdx ? "text-white/75" : "text-zinc-400"}`}>
                {d.targets_met}/{d.targets_total}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <CoveragePanel day={day} />

      {day.summary || plan.context?.length ? (
        <div className="grid gap-4 rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 text-sm dark:border-emerald-900 dark:bg-emerald-950/20">
          {day.summary ? (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-300">
                  {plan.reviewed_by === "gemini" ? "Checked by the AI reviewer" : "Checked against your restrictions"}
                </p>
                <p className="mt-1 leading-6 text-zinc-700 dark:text-zinc-200">{day.summary}</p>
              </div>
            </div>
          ) : null}
          {plan.context?.length ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Adjusted for you</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
                {plan.context.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <ol className="relative space-y-4 border-l-2 border-dashed border-emerald-200 pl-6 dark:border-emerald-900">
        {meals.map((m) => (
          <li key={m.slot} className="relative">
            <span className="absolute -left-[33px] top-5 h-4 w-4 rounded-full border-4 border-white bg-emerald-500 shadow dark:border-zinc-950" aria-hidden />
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-bold">{m.label}</span>
              <span className="text-xs tabular-nums text-zinc-400">{SLOT_TIME[m.slot]}</span>
              {day.changed?.some((c) => c.slot === m.slot) ? (
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
                  Updated for your latest readings
                  {day.changed.find((c) => c.slot === m.slot)?.removed ? ` · was ${day.changed.find((c) => c.slot === m.slot)?.removed}` : ""}
                </span>
              ) : null}
            </div>
            <MealCard meal={m} onSwap={info && onChange ? () => void openSwap(m) : undefined} swapping={swap?.slot === m.slot && swap.options === null} />
            {swap?.slot === m.slot && swap.options ? (
              <div className="mt-3 rounded-3xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Swap {m.label.toLowerCase()} for…</p>
                  <button onClick={() => setSwap(null)} className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
                    Cancel
                  </button>
                </div>
                {swap.error ? <p className="mt-2 text-sm text-rose-600">{swap.error}</p> : null}
                {!swap.error && !swap.options.length ? <p className="mt-2 text-sm text-zinc-500">No other options fit.</p> : null}
                <div className="mt-3 grid gap-2">
                  {swap.options.map((o) => (
                    <button
                      key={o.meal.recipe.RecipeId}
                      onClick={() => choose(o)}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left text-sm shadow-soft transition hover:ring-2 hover:ring-emerald-300 dark:bg-zinc-900"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{o.meal.recipe.Name}</span>
                        <span className="text-xs text-zinc-500">
                          {fmt(o.meal.recipe.Calories)} kcal · {fmt(o.meal.recipe.ProteinContent, 1)} g protein
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {o.targets_met}/{day.targets_total}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      {plan.notes.length ? (
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="font-semibold">Good to know</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-300">
            {plan.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
