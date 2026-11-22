"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCareBadge, useCareLinks, useLiveData } from "@/components/care/hooks";
import { listRecordsOfKind, updatePregnancyMonth } from "@/lib/care";
import { getNews, type NewsCard } from "@/lib/insights";
import { ActionTile, DoctorPanel, FocusPanel, Icon, JourneyCard, NewsPanel, Skeleton, ToolList, VitalsReminder, greeting } from "./HomeWidgets";

const ACTIONS = [
  { href: "/prescription-reader", icon: <Icon.scan />, title: "Read a prescription", text: "Photo in, plain-language summary out." },
  { href: "/medicines", icon: <Icon.pill />, title: "Check medicines", text: "Safe for this month? Clashes and timing." },
  { href: "/vitals", icon: <Icon.pulse />, title: "Record vitals", text: "Heart rate, oxygen, temperature, ECG." },
  { href: "/diet-planner", icon: <Icon.bowl />, title: "Plan meals", text: "Recipes for your trimester and needs." },
];

const TOOLS = [
  { href: "/recipe-finder", icon: <Icon.search size={18} />, title: "Recipe finder", text: "Start from what’s in your kitchen" },
  { href: "/health-analytics", icon: <Icon.chart size={18} />, title: "Health risk check", text: "Your vitals through our risk model" },
  { href: "/saved-recipes", icon: <Icon.heart size={18} />, title: "Saved recipes", text: "Meals you’ve kept for later" },
  { href: "/history", icon: <Icon.clock size={18} />, title: "Recommendation history", text: "Every plan you’ve generated" },
];

function useNews() {
  const [state, setState] = useState<{ value: NewsCard | null; loading: boolean }>({ value: null, loading: true });
  useEffect(() => {
    let live = true;
    void getNews().then((value) => {
      if (live) setState({ value, loading: false });
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export function HomeView() {
  const { user, role, roleLoading } = useAuth();
  if (roleLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Skeleton lines={4} />
      </div>
    );
  }
  return user && role === "patient" ? <Dashboard /> : <Landing />;
}

function Dashboard() {
  const { user, account, refreshAccount } = useAuth();
  const { active, loading } = useCareLinks();
  const unread = useCareBadge();
  const news = useNews();
  const [override, setOverride] = useState<number | null>(null);
  const [lastVitals, setLastVitals] = useState<{ uid: string; at: string | null; hours: number } | null>(null);
  const loadVitals = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await listRecordsOfKind(user.id, "vitals", 5);
      const at = rows.find((r) => !r.is_sample)?.created_at ?? null;
      setLastVitals({ uid: user.id, at, hours: at ? (Date.now() - new Date(at).getTime()) / 3_600_000 : Infinity });
    } catch {
      // the reminder is optional
    }
  }, [user]);
  useLiveData(loadVitals, 60_000);
  const vitalsAt = user && lastVitals?.uid === user.id ? lastVitals.at : undefined;
  const month = override ?? account?.patient?.pregnancy_month ?? null;

  const changeMonth = (m: number) => {
    setOverride(m);
    if (user) void updatePregnancyMonth(user.id, m).then(refreshAccount).catch(() => undefined);
  };

  const name = account?.patient?.full_name ?? (user?.user_metadata?.full_name as string | undefined) ?? null;
  const first = name?.trim().split(/\s+/)[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">{today}</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight md:text-4xl">
            {greeting()}
            {first ? <span className="text-emerald-700 dark:text-emerald-400">, {first}</span> : null}
          </h1>
        </div>
        <Link href="/medicines" className="inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
          <Icon.pill size={17} /> Check a medicine
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <JourneyCard month={month} onChangeMonth={changeMonth} className="lg:col-span-2" />
        <DoctorPanel link={active} loading={loading} unread={unread} />
      </div>

      <VitalsReminder lastAt={vitalsAt} hours={lastVitals?.hours ?? Infinity} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <ActionTile key={a.href} {...a} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <FocusPanel month={month} />
        <NewsPanel news={news.value} loading={news.loading} className="lg:col-span-2" />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">More tools</h2>
        <ToolList items={TOOLS} />
      </section>
    </div>
  );
}

const FEATURES = [
  { icon: <Icon.scan />, title: "Prescription reader", text: "Snap a prescription or lab report and get a clear summary, the medicines it found and diet guidance." },
  { icon: <Icon.pill />, title: "Medicine safety", text: "Checks every medicine and supplement against your month of pregnancy, flags clashes and builds a daily timing plan." },
  { icon: <Icon.pulse />, title: "Vital signs", text: "Heart rate, oxygen, temperature and ECG from the MamaCare device, analysed and shared with your doctor." },
  { icon: <Icon.bowl />, title: "Meal planning", text: "Recipes from 338,000 matched to your trimester, conditions and what you can and can’t eat." },
  { icon: <Icon.stetho />, title: "Your doctor, connected", text: "Choose your doctor, share records in one tap and get their reviews, comments and diet instructions." },
  { icon: <Icon.chart />, title: "Risk check", text: "A machine-learning risk assessment from your readings, with clear next steps." },
];

function Landing() {
  const news = useNews();
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Pregnancy care, in one place
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
            Calm, clear care for you <span className="text-emerald-700 dark:text-emerald-400">and your baby.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
            Meal plans for your trimester, medicine checks you can trust, readings from your device, and your doctor reviewing it all.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex h-12 items-center rounded-xl bg-emerald-600 px-6 font-semibold text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,0.8)] transition hover:bg-emerald-500">
              Create a free account
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-xl border border-zinc-300 bg-white px-6 font-semibold transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800">
              Log in
            </Link>
          </div>
          <p className="mt-5 text-sm text-zinc-500">
            Are you a doctor?{" "}
            <Link href="/doctor/login" className="font-semibold text-sky-700 hover:underline dark:text-sky-400">
              Doctor login
            </Link>
          </p>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_70%_30%,rgba(16,185,129,0.14),transparent)]" />
          <JourneyCard month={6} />
          <div className="-mt-6 ml-8 mr-4 rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.25)] dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Icon.pill size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Paracetamol 500 mg · 1-0-1</div>
                <div className="text-xs text-zinc-500">Commonly used in pregnancy · 8 am and 8 pm</div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">OK</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-20">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">What’s inside</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Everything a pregnancy needs to keep track of</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border border-zinc-200/80 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900">{f.icon}</span>
              <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col justify-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">Today’s read</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">New pregnancy research, in plain language</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Picked from ScienceDaily’s pregnancy and childbirth feed, with a link to the source.</p>
        </div>
        <NewsPanel news={news.value} loading={news.loading} className="lg:col-span-2" />
      </section>
    </div>
  );
}
