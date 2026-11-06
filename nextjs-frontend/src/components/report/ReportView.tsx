import type { ReactNode } from "react";
import { humanizeDocType, type DietPlan, type ExtractedReport, type LabTest } from "@/lib/report";
import {
  AlertIcon,
  BowlIcon,
  CalendarIcon,
  ChatIcon,
  CheckIcon,
  FlaskIcon,
  InfoIcon,
  PillIcon,
  StethoscopeIcon,
  UserIcon,
  XIcon,
} from "./icons";

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <span className="text-zinc-400">{icon}</span>
        {title}
        {count != null ? (
          <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {count}
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function List({ items, marker = "dot" }: { items: string[]; marker?: "dot" | "num" }) {
  return (
    <ol className="space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          {marker === "num" ? (
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {i + 1}
            </span>
          ) : (
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Meta({ icon, label, value }: { icon: ReactNode; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        {icon}
      </span>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function FlagBadge({ flag }: { flag?: LabTest["flag"] }) {
  if (!flag) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  const f = flag.toLowerCase();
  const tone =
    f.startsWith("h") || f.includes("abnormal") || f.includes("critical")
      ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
      : f.startsWith("l")
        ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 ${tone}`}>{flag}</span>;
}

export function ReportView({ report }: { report: ExtractedReport }) {
  const { patient, document: doc } = report;
  const patientLine = [patient.name, patient.age && `${patient.age}`, patient.sex].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-white p-5 dark:border-emerald-900/50 dark:from-emerald-950/30 dark:via-zinc-950 dark:to-zinc-950">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
          {humanizeDocType(doc.type)}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Meta icon={<UserIcon size={15} />} label="Patient" value={patientLine || undefined} />
          <Meta icon={<CalendarIcon size={15} />} label="Date" value={doc.date} />
          <Meta icon={<StethoscopeIcon size={15} />} label="Provider" value={doc.provider} />
        </div>
        {report.allergies.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-emerald-100 pt-4 dark:border-emerald-900/40">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400">
              <AlertIcon size={14} /> Allergies
            </span>
            {report.allergies.map((a) => (
              <span key={a} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900">
                {a}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {report.uncertainties.length ? (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertIcon size={18} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Parts that couldn’t be read with certainty</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-800 dark:text-amber-300/90">
              {report.uncertainties.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
            <div className="mt-2 text-xs">Check these against the original document or ask your clinician.</div>
          </div>
        </div>
      ) : null}

      {report.medications.length ? (
        <Section icon={<PillIcon size={16} />} title="Medicines" count={report.medications.length}>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.medications.map((m, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="font-semibold leading-snug">{m.name}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.dose ? <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">{m.dose}</span> : null}
                  {m.frequency ? <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{m.frequency}</span> : null}
                  {m.duration ? <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{m.duration}</span> : null}
                </div>
                {m.notes ? <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{m.notes}</p> : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {report.tests.length ? (
        <Section icon={<FlaskIcon size={16} />} title="Test results" count={report.tests.length}>
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
                  <th className="px-5 pb-2 font-medium">Test</th>
                  <th className="px-2 pb-2 font-medium">Result</th>
                  <th className="px-2 pb-2 font-medium">Reference</th>
                  <th className="px-5 pb-2 text-right font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {report.tests.map((t, i) => (
                  <tr key={i} className="border-b border-zinc-50 last:border-0 dark:border-zinc-900">
                    <td className="px-5 py-2.5 font-medium">{t.name}</td>
                    <td className="px-2 py-2.5 font-mono tabular-nums">
                      {t.value ?? "—"} {t.unit ? <span className="text-zinc-500">{t.unit}</span> : null}
                    </td>
                    <td className="px-2 py-2.5 text-zinc-500">{t.reference_range ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right"><FlagBadge flag={t.flag} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {report.diagnoses.length ? (
          <Section icon={<StethoscopeIcon size={16} />} title="Diagnoses">
            <div className="flex flex-wrap gap-2">
              {report.diagnoses.map((d) => (
                <span key={d} className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm dark:bg-zinc-800">{d}</span>
              ))}
            </div>
          </Section>
        ) : null}
        {report.instructions.length ? (
          <Section icon={<InfoIcon size={16} />} title="Instructions"><List items={report.instructions} /></Section>
        ) : null}
        {report.dietary_notes.length ? (
          <Section icon={<BowlIcon size={16} />} title="Dietary notes on the document"><List items={report.dietary_notes} /></Section>
        ) : null}
        {report.follow_up.length ? (
          <Section icon={<CalendarIcon size={16} />} title="Follow-up"><List items={report.follow_up} /></Section>
        ) : null}
      </div>
    </div>
  );
}

export function DietPlanView({ plan }: { plan: DietPlan }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-100 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">Your diet plan</div>
        <h3 className="mt-1 text-lg font-semibold tracking-tight">{plan.title}</h3>
        {plan.summary ? <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{plan.summary}</p> : null}
      </div>

      <div className="grid gap-px bg-zinc-100 dark:bg-zinc-800 md:grid-cols-2">
        <div className="bg-white p-5 dark:bg-zinc-950">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Eat more of</h4>
          <ul className="space-y-2.5 text-sm">
            {plan.do.map((d, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"><CheckIcon size={12} /></span>
                <span className="leading-6 text-zinc-700 dark:text-zinc-300">{d}</span>
              </li>
            ))}
            {!plan.do.length ? <li className="text-zinc-400">—</li> : null}
          </ul>
        </div>
        <div className="bg-white p-5 dark:bg-zinc-950">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">Limit or avoid</h4>
          <ul className="space-y-2.5 text-sm">
            {plan.avoid.map((d, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"><XIcon size={12} /></span>
                <span className="leading-6 text-zinc-700 dark:text-zinc-300">{d}</span>
              </li>
            ))}
            {!plan.avoid.length ? <li className="text-zinc-400">—</li> : null}
          </ul>
        </div>
      </div>

      {plan.meal_ideas.length ? (
        <div className="border-t border-zinc-100 p-5 dark:border-zinc-800">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500"><BowlIcon size={14} />Meal ideas</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {plan.meal_ideas.map((m, i) => (
              <div key={i} className="rounded-xl bg-zinc-50 px-3.5 py-2.5 text-sm leading-6 dark:bg-zinc-900">{m}</div>
            ))}
          </div>
        </div>
      ) : null}

      {plan.questions_for_doctor.length ? (
        <div className="border-t border-zinc-100 p-5 dark:border-zinc-800">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500"><ChatIcon size={14} />Ask your doctor</h4>
          <List items={plan.questions_for_doctor} marker="num" />
        </div>
      ) : null}

      {plan.safety_notes.length ? (
        <div className="border-t border-zinc-100 bg-zinc-50/70 px-5 py-4 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
          {plan.safety_notes.join(" ")}
        </div>
      ) : null}
    </section>
  );
}
