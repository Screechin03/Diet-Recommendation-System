import type { ReactNode } from "react";

/** Page heading used across the site: icon tile, eyebrow, large title, subtitle, actions on the right. */
export function PageIntro({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex max-w-2xl items-start gap-4">
        {icon ? (
          <span className="mt-1 hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-500 text-white shadow-lift sm:grid">
            {icon}
          </span>
        ) : null}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">{eyebrow}</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-[15px] leading-6 text-zinc-600 dark:text-zinc-300">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
