"use client";

import Link from "next/link";
import type { ReactNode, SVGProps } from "react";
import { AlertIcon, CheckIcon, FileIcon, InfoIcon, PillIcon, SparkIcon, StethoscopeIcon } from "@/components/report/icons";
import {
  initials,
  KIND_COPY,
  SEVERITY_COPY,
  VERDICT_COPY,
  type RecordKind,
  type RecordSummary,
  type Severity,
} from "@/lib/care";

export type Tone = "green" | "amber" | "red" | "gray" | "blue" | "violet";

const PILL: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  red: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  blue: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900",
};

const DOT: Record<Tone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  gray: "bg-zinc-400",
  blue: "bg-sky-500",
  violet: "bg-violet-500",
};

export function Pill({ tone = "gray", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${PILL[tone]}`}>
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} /> : null}
      {children}
    </span>
  );
}

export function CountBadge({ n, tone = "red" }: { n: number; tone?: "red" | "blue" }) {
  if (!n) return null;
  return (
    <span
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${tone === "red" ? "bg-rose-600" : "bg-sky-600"}`}
      aria-label={`${n} new`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function Avatar({ name, size = 40, tone = "green" }: { name: string | null | undefined; size?: number; tone?: "green" | "blue" | "gray" }) {
  const cls =
    tone === "blue"
      ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
      : tone === "gray"
        ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${cls}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function StethoscopeBadge({ size = 44 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <StethoscopeIcon size={Math.round(size * 0.48)} />
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${className}`}>{children}</section>
  );
}

export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-zinc-500">
      <Spinner size={18} /> {label}
    </div>
  );
}

export function Notice({
  tone = "gray",
  title,
  children,
  action,
}: {
  tone?: "gray" | "amber" | "red" | "blue" | "green";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const cls = {
    gray: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
    red: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200",
    blue: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
  }[tone];
  const icon = tone === "red" || tone === "amber" ? <AlertIcon size={18} /> : tone === "green" ? <CheckIcon size={18} /> : <InfoIcon size={18} />;
  return (
    <div role={tone === "red" ? "alert" : undefined} className={`flex gap-3 rounded-2xl border p-4 text-sm ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={title ? "mt-0.5 leading-6" : "leading-6"}>{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white/60 px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-950/40">
      {icon ? <span className="mb-3 text-zinc-400">{icon}</span> : null}
      <div className="font-semibold">{title}</div>
      {text ? <p className="mt-1 max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-400">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

const BTN = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
  emerald: "bg-emerald-600 text-white hover:bg-emerald-500",
  sky: "bg-sky-600 text-white hover:bg-sky-500",
  secondary: "border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900",
  ghost: "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-zinc-950 dark:text-rose-300 dark:hover:bg-rose-950/30",
} as const;

export function buttonClass(variant: keyof typeof BTN = "primary", size: "sm" | "md" = "md"): string {
  return `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm"
  } ${BTN[variant]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button {...props} disabled={props.disabled || loading} className={`${buttonClass(variant, size)} ${className}`}>
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
}

export const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-emerald-700";

export const doctorInputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-sky-700";

// ---------------------------------------------------------------------------------------------------------
// Record badges
// ---------------------------------------------------------------------------------------------------------

export function SeverityPill({ severity }: { severity: Severity }) {
  const c = SEVERITY_COPY[severity];
  return (
    <Pill tone={c.tone} dot>
      {c.label}
    </Pill>
  );
}

export function ReviewPill({ record, doctorView }: { record: Pick<RecordSummary, "review_status" | "verdict">; doctorView?: boolean }) {
  if (record.review_status === "requested") return <Pill tone="blue">{doctorView ? "Review requested" : "Awaiting review"}</Pill>;
  if (record.review_status === "reviewed" && record.verdict) {
    const v = VERDICT_COPY[record.verdict];
    return (
      <Pill tone={v.tone}>
        <CheckIcon size={11} /> {v.label}
      </Pill>
    );
  }
  return null;
}

const KIND_STYLE: Record<RecordKind, string> = {
  report: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  vitals: "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300",
  risk: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  diet_plan: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  med_check: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
};

export function KindIcon({ kind, size = 36 }: { kind: RecordKind; size?: number }) {
  const icon =
    kind === "report" ? <FileIcon size={size * 0.5} /> : kind === "vitals" ? <HeartPulseIcon size={size * 0.5} /> : kind === "risk" ? <ShieldIcon size={size * 0.5} /> : kind === "med_check" ? <PillIcon size={size * 0.5} /> : <SparkIcon size={size * 0.5} />;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl ${KIND_STYLE[kind]}`} style={{ width: size, height: size }} aria-label={KIND_COPY[kind].label}>
      {icon}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
      <ArrowLeftIcon size={15} /> {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Extra icons (same style as components/report/icons.tsx)
// ---------------------------------------------------------------------------------------------------------

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export const HeartPulseIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 7.5 6z" /><path d="M3.5 12h4l1.5-2.5 2 5 1.5-2.5h2" /></svg>
);
export const ShieldIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const InboxIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 13h4l1.5 3h5L16 13h4" /><path d="M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z" /></svg>
);
export const UsersIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 20a6.5 6.5 0 0 0-2.4-5" /></svg>
);
export const SendIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m4 12 16-8-6 16-2.5-6.5z" /><path d="m11.5 13.5 3-3" /></svg>
);
export const ArrowLeftIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M19 12H5m6-6-6 6 6 6" /></svg>
);
export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
);
export const ExternalIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
);
export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const LinkIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
);
export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
