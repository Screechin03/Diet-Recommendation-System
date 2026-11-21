import type { ReactNode } from "react";
import { CheckIcon } from "@/components/report/icons";

const POINTS = [
  ["Records arrive on their own", "Scanned reports, device vitals, risk checks and diet plans appear as soon as your patient saves them."],
  ["Urgent results come first", "High-risk checks and urgent vital signs are flagged at the top of your inbox."],
  ["Review in one step", "Mark a record as fine, needing changes, or ask the patient to come in, with a note she sees straight away."],
  ["Guide her diet", "Set foods to avoid and include; her diet planner applies them automatically."],
];

/** Two-column frame for the doctor login and sign-up pages. */
export function DoctorAuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_480px] lg:py-16">
      <div className="hidden flex-col justify-center rounded-3xl bg-gradient-to-br from-sky-600 to-sky-800 p-10 text-white shadow-sm lg:flex">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-100">MamaCare for doctors</p>
        <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight">Your pregnant patients, between visits.</h2>
        <ul className="mt-8 space-y-5">
          {POINTS.map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15"><CheckIcon size={14} /></span>
              <div>
                <div className="font-semibold">{t}</div>
                <div className="text-sm leading-6 text-sky-100">{d}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
