"use client";

import type { ReactNode } from "react";
import { AlertIcon, CheckIcon, InfoIcon, PillIcon } from "@/components/report/icons";
import { ClockIcon, Pill, type Tone } from "@/components/care/ui";
import { STATUS_COPY, TIER_COPY, type MedCheckResult, type MedInteraction, type MedResult, type MedTier } from "@/lib/meds";

const BANNER: Record<"green" | "amber" | "red", string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100",
  amber: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100",
  red: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100",
};
const DOT: Record<string, string> = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500", gray: "bg-zinc-300 dark:bg-zinc-600" };

function TierPill({ tier }: { tier: MedTier }) {
  const c = TIER_COPY[tier];
  return <Pill tone={c.tone as Tone} dot>{c.short}</Pill>;
}

function TrimesterStrip({ tiers, current }: { tiers: Record<"t1" | "t2" | "t3", MedTier>; current: number | null }) {
  return (
    <div className="flex items-center gap-1" aria-label="By trimester">
      {(["t1", "t2", "t3"] as const).map((t, i) => (
        <span
          key={t}
          title={`Trimester ${i + 1}: ${TIER_COPY[tiers[t]].label}`}
          className={`flex h-5 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold ${
            current === i + 1 ? "ring-2 ring-zinc-900/20 dark:ring-white/30" : ""
          } bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[TIER_COPY[tiers[t]].tone]}`} />T{i + 1}
        </span>
      ))}
    </div>
  );
}

function MedicineCard({ m, trimester }: { m: MedResult; trimester: number | null }) {
  const many = m.ingredients.length > 1;
  return (
    <article className="rounded-3xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold">
            <span className="text-zinc-400"><PillIcon size={16} /></span>
            {m.label}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {m.input.toLowerCase() !== m.label.toLowerCase() ? `“${m.input}” · ` : ""}
            {[m.dose, m.frequency].filter(Boolean).join(" · ")}
            {m.match_confidence === "fuzzy" ? " · matched by similar spelling, please check" : ""}
          </div>
        </div>
        <TierPill tier={m.tier} />
      </div>

      {m.matched ? (
        <ul className="mt-3 space-y-3">
          {m.ingredients.map((g) => (
            <li key={g.id} className={many ? "border-l-2 border-zinc-100 pl-3 dark:border-zinc-800" : ""}>
              {many ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                  {g.name} <TierPill tier={g.tier} />
                </div>
              ) : null}
              <p className="mt-1 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{g.note}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                <TrimesterStrip tiers={g.by_trimester} current={trimester} />
                <span>Source: {g.source}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : m.label_info ? (
        <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          From the drug label: {TIER_COPY[m.label_info.tier].label.toLowerCase()}. <span className="text-xs text-zinc-500">({m.label_info.source})</span>
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          We couldn’t identify this medicine. Check the spelling, or ask your doctor or pharmacist whether it’s right for you in pregnancy.
        </p>
      )}

      {m.model?.risk ? (
        <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
          Research model estimate (not verified): {Object.entries(m.model.risk).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${TIER_COPY[k as MedTier]?.short ?? k} ${Math.round(v * 100)}%`).join(" · ")}
        </p>
      ) : null}
      {m.dont_stop && m.tier !== "generally_used" ? (
        <p className="mt-2 flex gap-2 text-xs font-medium text-rose-700 dark:text-rose-300">
          <AlertIcon size={14} className="mt-0.5 shrink-0" /> Don’t stop this medicine on your own. Talk to your doctor first.
        </p>
      ) : null}
    </article>
  );
}

function InteractionRow({ x, result }: { x: MedInteraction; result: MedCheckResult }) {
  const a = result.medicines[x.a]?.label ?? "?";
  const b = result.medicines[x.b]?.label ?? "?";
  const tone = x.origin === "model" ? "text-violet-600" : x.severity === "avoid" ? "text-rose-600" : x.severity === "caution" ? "text-amber-600" : "text-sky-600";
  const icon = x.severity === "timing" ? <ClockIcon size={16} /> : x.origin === "model" ? <InfoIcon size={16} /> : <AlertIcon size={16} />;
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 shrink-0 ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{a} + {b}</div>
        <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{x.effect} {x.advice}</p>
        <div className="text-[11px] text-zinc-500">
          {x.origin === "model" ? `Unverified model signal (score ${x.score?.toFixed(2)}) · ` : ""}
          {x.source}
        </div>
      </div>
    </li>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60 shadow-soft">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note ? <p className="mt-0.5 text-xs text-zinc-500">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Full result of a medicine check. `compact` hides the daily plan (used inside the prescription reader). */
export function MedCheckView({ result, compact = false }: { result: MedCheckResult; compact?: boolean }) {
  const s = STATUS_COPY[result.status];
  const checked = result.interactions.filter((x) => x.origin !== "model");
  const modelSignals = result.interactions.filter((x) => x.origin === "model");
  const serious = checked.filter((x) => x.severity !== "timing");
  const timing = checked.filter((x) => x.severity === "timing");
  const stopWarn = result.medicines.filter((m) => m.dont_stop && m.tier !== "generally_used");

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-5 ${BANNER[s.tone]}`}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
          {result.status === "ok" ? <CheckIcon size={14} /> : <AlertIcon size={14} />} {s.label}
          {result.pregnancy_month ? <span className="font-normal normal-case tracking-normal">· month {result.pregnancy_month} (trimester {result.trimester})</span> : null}
        </div>
        <p className="mt-1 text-lg font-semibold tracking-tight">{result.headline}</p>
      </div>

      {stopWarn.length ? (
        <div className="flex gap-3 rounded-3xl border border-rose-200 bg-white p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-zinc-900/60 dark:text-rose-200 shadow-soft">
          <AlertIcon size={18} className="mt-0.5 shrink-0" />
          <span>
            <b>Don’t stop {stopWarn.map((m) => m.label).join(", ")} suddenly.</b> Stopping some medicines on your own can be more dangerous than
            continuing. Ask your doctor about switching.
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {result.medicines.map((m) => <MedicineCard key={m.index} m={m} trimester={result.trimester} />)}
      </div>

      {serious.length ? (
        <Section title="Combinations to check with your doctor">
          <ul className="space-y-4">{serious.map((x, i) => <InteractionRow key={i} x={x} result={result} />)}</ul>
        </Section>
      ) : null}

      {timing.length ? (
        <Section title="Take these apart" note="Fine together, but one stops the other being absorbed.">
          <ul className="space-y-4">{timing.map((x, i) => <InteractionRow key={i} x={x} result={result} />)}</ul>
        </Section>
      ) : null}

      {!compact && result.schedule.slots.length ? (
        <Section title="Your daily timing plan" note="A suggestion that keeps the timing gaps above. Always follow your prescription.">
          <ol className="relative space-y-3 border-l border-zinc-200 pl-5 dark:border-zinc-800">
            {result.schedule.slots.map((slot) => (
              <li key={slot.slot}>
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <div className="text-xs font-semibold text-zinc-500">{slot.time} · {slot.label}</div>
                <ul className="mt-1 space-y-1">
                  {slot.items.map((it) => (
                    <li key={it.index} className="text-sm">
                      <b>{it.label}</b>
                      {it.food ? <span className="text-zinc-500"> · {it.food}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {result.schedule.as_needed.length ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Only when needed: {result.schedule.as_needed.map((x) => x.label).join(", ")}</p>
          ) : null}
          {result.schedule.weekly.length ? (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Weekly: {result.schedule.weekly.map((x) => x.label).join(", ")}</p>
          ) : null}
          {result.schedule.notes.map((n) => <p key={n} className="mt-2 text-xs text-zinc-500">{n}</p>)}
        </Section>
      ) : null}

      {modelSignals.length ? (
        <Section title="Research model signals (not verified)" note="Predicted by our graph model from drug-interaction data. Not checked by a clinician; ask your doctor or pharmacist.">
          <ul className="space-y-4">{modelSignals.map((x, i) => <InteractionRow key={i} x={x} result={result} />)}</ul>
        </Section>
      ) : null}

      <p className="px-1 text-xs leading-5 text-zinc-500">{result.disclaimer}</p>
    </div>
  );
}
