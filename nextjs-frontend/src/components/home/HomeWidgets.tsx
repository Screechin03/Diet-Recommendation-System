"use client";

// Building blocks of the home page: journey hero, action tiles, care team, focus, research news, tool list.
import Link from "next/link";
import { useState, type ReactNode, type SVGProps } from "react";
import { doctorName, initials, timeAgo, type CareLink } from "@/lib/care";
import { MONTHS, trimesterOf, type NewsCard } from "@/lib/insights";

// ---------------------------------------------------------------------------------------------------------
// Icons (24px grid, 1.8 stroke, same style as the rest of the site)
// ---------------------------------------------------------------------------------------------------------

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
function svg({ size = 20, ...p }: IconProps) {
  return { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p };
}
export const Icon = {
  scan: (p: IconProps) => <svg {...svg(p)}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9h8M8 12h8M8 15h5" /></svg>,
  pill: (p: IconProps) => <svg {...svg(p)}><rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="m9.5 9.5 5 5" /></svg>,
  pulse: (p: IconProps) => <svg {...svg(p)}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>,
  bowl: (p: IconProps) => <svg {...svg(p)}><path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M8 20h8M12 4c1 1.2 1 2.3 0 3.5M8.5 5c.8 1 .8 2 0 3M15.5 5c.8 1 .8 2 0 3" /></svg>,
  search: (p: IconProps) => <svg {...svg(p)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>,
  chart: (p: IconProps) => <svg {...svg(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  heart: (p: IconProps) => <svg {...svg(p)}><path d="M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 7.5 6z" /></svg>,
  clock: (p: IconProps) => <svg {...svg(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  chat: (p: IconProps) => <svg {...svg(p)}><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></svg>,
  arrow: (p: IconProps) => <svg {...svg(p)}><path d="M5 12h14m-6-6 6 6-6 6" /></svg>,
  news: (p: IconProps) => <svg {...svg(p)}><path d="M4 5h13v14H6a2 2 0 0 1-2-2z" /><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 12.5h5M8 16h3" /></svg>,
  bulb: (p: IconProps) => <svg {...svg(p)}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z" /></svg>,
  stetho: (p: IconProps) => <svg {...svg(p)}><path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></svg>,
};

// ---------------------------------------------------------------------------------------------------------

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Ring({ value, size = 112, stroke = 9, children }: { value: number; size?: number; stroke?: number; children: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="white"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

/** Emerald hero: month, weeks, baby size and the nine months. `month` null = not set yet. */
export function JourneyCard({ month, onChangeMonth, className = "" }: { month: number | null; onChangeMonth?: (m: number) => void; className?: string }) {
  const [picking, setPicking] = useState(false);
  const m = month ?? 0;
  const info = month ? MONTHS[month] : null;
  return (
    <section className={`relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-600 p-7 text-white shadow-[0_20px_50px_-24px_rgba(4,120,87,0.6)] ${className}`}>
      <svg className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 text-white/10" viewBox="0 0 200 200" aria-hidden>
        <circle cx="100" cy="100" r="98" stroke="currentColor" fill="none" />
        <circle cx="100" cy="100" r="70" stroke="currentColor" fill="none" />
        <circle cx="100" cy="100" r="42" stroke="currentColor" fill="none" />
      </svg>
      <div className="relative flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
            {month ? `Trimester ${trimesterOf(month)} · Month ${month}` : "Your pregnancy"}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{info ? info.weeks : "Set your month"}</h2>
          <p className="mt-2 max-w-md text-[15px] leading-6 text-white/85">
            {info ? (
              <>
                Your baby is about the size of <span className="font-semibold text-white">{info.size}</span>.
              </>
            ) : (
              "Tell us how far along you are and every check, plan and tip adapts to it."
            )}
          </p>
        </div>
        <Ring value={m / 9}>
          <div className="text-3xl font-bold leading-none tracking-tight">{month ?? "–"}</div>
          <div className="mt-1 text-[10px] font-bold tracking-widest text-white/70">OF 9</div>
        </Ring>
      </div>

      <div className="relative mt-7 grid grid-cols-3 gap-3" aria-hidden>
        {[0, 1, 2].map((g) => (
          <div key={g}>
            <div className="flex gap-1">
              {[1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${g * 3 + i <= m ? "bg-white" : "bg-white/20"}`} />
              ))}
            </div>
            <div className="mt-2 text-[11px] font-semibold text-white/60">Trimester {g + 1}</div>
          </div>
        ))}
      </div>

      {onChangeMonth ? (
        <div className="relative mt-5 flex flex-wrap items-center gap-2">
          {picking || !month ? (
            <>
              {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    onChangeMonth(n);
                    setPicking(false);
                  }}
                  aria-label={`Month ${n}`}
                  aria-pressed={n === month}
                  className={`h-9 w-9 rounded-full text-sm font-bold transition ${n === month ? "bg-white text-emerald-800" : "bg-white/12 text-white hover:bg-white/25"}`}
                >
                  {n}
                </button>
              ))}
            </>
          ) : (
            <>
              <span className="text-sm text-white/75">{month >= 9 ? "Final month: nearly there" : `${9 - month} month${9 - month === 1 ? "" : "s"} to go`}</span>
              <button onClick={() => setPicking(true)} className="ml-auto rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold backdrop-blur transition hover:bg-white/25">
                Change month
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-zinc-900/60 ${className}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">{children}</p>
      {action}
    </div>
  );
}

export function ActionTile({ href, icon, title, text }: { href: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-4 rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_14px_30px_-16px_rgba(4,120,87,0.35)] dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-emerald-900"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition group-hover:bg-emerald-600 group-hover:text-white group-hover:ring-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900">
        {icon}
      </span>
      <div>
        <div className="flex items-center gap-1.5 font-semibold tracking-tight">
          {title}
          <Icon.arrow size={15} className="-translate-x-1 text-emerald-600 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
        <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{text}</p>
      </div>
    </Link>
  );
}

export function FocusPanel({ month }: { month: number | null }) {
  const focus = MONTHS[month ?? 4].focus;
  return (
    <Panel className="flex flex-col gap-4">
      <Eyebrow action={<Link href="/diet-planner" className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400">Plan meals</Link>}>
        Focus this month
      </Eyebrow>
      <div className="grid grid-cols-3 gap-2">
        {focus.map((f, i) => (
          <div
            key={f}
            className={`rounded-2xl px-3 py-3.5 text-center text-sm font-semibold ${i === 0 ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-zinc-50 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200"}`}
          >
            {f}
          </div>
        ))}
      </div>
      <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        {month ? "Your planner already favours recipes rich in these." : "Set your month to see what matters most right now."}
      </p>
    </Panel>
  );
}

export function DoctorPanel({ link, loading, unread }: { link: CareLink | null; loading: boolean; unread: number }) {
  if (loading) {
    return (
      <Panel className="flex flex-col gap-4">
        <Skeleton lines={3} />
      </Panel>
    );
  }
  if (!link) {
    return (
      <Panel className="flex flex-col gap-4 bg-gradient-to-br from-white to-emerald-50/60 dark:from-zinc-900/60 dark:to-emerald-950/20">
        <Eyebrow>Your care team</Eyebrow>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white">
          <Icon.stetho size={22} />
        </span>
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Add your doctor</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Share reports and readings in one tap and get their reviews and diet advice here.</p>
        </div>
        <Link href="/care/doctors" className="mt-auto inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Choose a doctor
        </Link>
      </Panel>
    );
  }
  const d = link.doctor;
  return (
    <Panel className="flex flex-col gap-5">
      <Eyebrow>Your care team</Eyebrow>
      <div className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-lg font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {initials(d?.full_name)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold tracking-tight">{doctorName(d?.full_name)}</div>
          <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">{[d?.specialty, d?.hospital].filter(Boolean).join(" · ") || "Your doctor"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/care/messages" className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-500">
          <Icon.chat size={17} /> Message
          {unread ? <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold ring-2 ring-white dark:ring-zinc-900">{unread > 9 ? "9+" : unread}</span> : null}
        </Link>
        <Link href="/care" className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 text-sm font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
          Records
        </Link>
      </div>
      <p className="mt-auto flex items-center gap-2 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <Icon.clock size={14} /> Under their care since {timeAgo(link.started_at)}
      </p>
    </Panel>
  );
}

export function NewsPanel({ news, loading, className = "" }: { news: NewsCard | null; loading: boolean; className?: string }) {
  if (loading) {
    return (
      <Panel className={className}>
        <Skeleton lines={4} />
      </Panel>
    );
  }
  if (!news) return null;
  const isTip = news.kind === "tip";
  const body = (
    <>
      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
        {isTip ? <Icon.bulb size={16} /> : <Icon.news size={16} />}
        <span className="text-[11px] font-bold uppercase tracking-[0.16em]">{isTip ? "Daily tip" : `Research · ${news.topic}`}</span>
        {!isTip ? (
          <span className="ml-auto text-xs text-zinc-400">
            {news.source}
            {news.published ? ` · ${timeAgo(news.published)}` : ""}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-xl font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">{news.headline}</h3>
      <p className="mt-2 line-clamp-3 text-[15px] leading-6 text-zinc-600 dark:text-zinc-300">{news.summary}</p>
      {news.url ? (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
            Read the article <Icon.arrow size={15} className="transition group-hover:translate-x-0.5" />
          </span>
          {news.ai_summary ? <span className="ml-auto text-xs text-zinc-400">Plain-language summary</span> : null}
        </div>
      ) : null}
    </>
  );
  const cls = `group block rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900/60 ${className}`;
  return news.url ? (
    <a href={news.url} target="_blank" rel="noopener noreferrer" className={`${cls} transition hover:border-emerald-200 dark:hover:border-emerald-900`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Daily vitals check-in: a quiet line when recent, a clear prompt after 24 hours. `lastAt` undefined = loading. */
export function VitalsReminder({ lastAt, hours }: { lastAt: string | null | undefined; hours: number }) {
  if (lastAt === undefined) return null;
  if (lastAt && hours < 24) {
    return (
      <Link href="/vitals" className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        Vitals recorded {timeAgo(lastAt)} · next check-in in {Math.max(1, Math.round(24 - hours))} h
      </Link>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-500 text-white" aria-hidden>
        <Icon.pulse size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Time for today’s vitals</div>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          {lastAt ? `Last recorded ${timeAgo(lastAt)}.` : "No readings yet."} Fresh readings keep your meal plan and your doctor up to date.
        </div>
      </div>
      <Link href="/vitals" className="inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">
        Record now
      </Link>
    </div>
  );
}

export function ToolList({ items }: { items: Array<{ href: string; icon: ReactNode; title: string; text: string }> }) {
  return (
    <div className="divide-y divide-zinc-100 overflow-hidden rounded-3xl border border-zinc-200/80 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-600 transition group-hover:bg-emerald-100 group-hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-300">
            {it.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold tracking-tight">{it.title}</span>
            <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">{it.text}</span>
          </span>
          <Icon.arrow size={16} className="text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" />
        </Link>
      ))}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 ${i === 0 ? "w-1/3" : i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}
