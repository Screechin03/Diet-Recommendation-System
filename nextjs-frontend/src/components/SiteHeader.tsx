"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthNav } from "@/components/AuthNav";
import { useAuth } from "@/components/AuthProvider";
import { useCareBadge } from "@/components/care/hooks";
import { CountBadge } from "@/components/care/ui";
import { doctorName } from "@/lib/care";

const PATIENT_LINKS = [
  { href: "/diet-planner", label: "Diet Planner" },
  { href: "/recipe-finder", label: "Recipe Finder" },
  { href: "/health-analytics", label: "Health Analytics" },
  { href: "/vitals", label: "Vitals" },
  { href: "/prescription-reader", label: "Prescription Reader" },
  { href: "/features", label: "Features" },
  { href: "/docs", label: "Docs" },
];

const DOCTOR_LINKS = [
  { href: "/doctor", label: "Inbox", badge: true },
  { href: "/doctor/patients", label: "Patients" },
  { href: "/doctor/profile", label: "Profile" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/doctor") return pathname === "/doctor";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const { user, role, account, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const badge = useCareBadge();
  const doctorArea = pathname.startsWith("/doctor");

  if (role === "doctor" || (doctorArea && !user)) {
    const signedIn = role === "doctor";
    return (
      <header className="border-b border-sky-100 bg-white/80 backdrop-blur dark:border-sky-950 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <Link href={signedIn ? "/doctor" : "/doctor/login"} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white">M</span>
            <span className="text-base font-semibold tracking-tight">MamaCare</span>
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900">
              For doctors
            </span>
          </Link>
          {signedIn ? (
            <div className="flex flex-wrap items-center gap-1">
              <nav className="flex items-center gap-1 text-sm" aria-label="Doctor">
                {DOCTOR_LINKS.map((l) => {
                  const on = isActive(pathname, l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      aria-current={on ? "page" : undefined}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                        on ? "bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      }`}
                    >
                      {l.label}
                      {l.badge ? <CountBadge n={badge} tone="blue" /> : null}
                    </Link>
                  );
                })}
              </nav>
              <span className="mx-2 hidden h-5 w-px bg-zinc-200 dark:bg-zinc-800 sm:block" />
              <span className="hidden text-xs text-zinc-500 sm:inline">{doctorName(account?.doctor?.full_name)}</span>
              <button
                onClick={async () => {
                  try {
                    await signOut();
                  } finally {
                    router.push("/doctor/login");
                  }
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Patient site →
            </Link>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Pregnancy Nutrition Guide
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <nav className="flex flex-wrap items-center gap-1 text-sm text-zinc-700 dark:text-zinc-300">
            {PATIENT_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 ${isActive(pathname, l.href) ? "font-medium text-zinc-950 dark:text-white" : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          {user && role === "patient" ? (
            <Link
              href="/care"
              aria-current={isActive(pathname, "/care") ? "page" : undefined}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              My care
              <CountBadge n={badge} />
            </Link>
          ) : null}
          <AuthNav />
        </div>
      </div>
    </header>
  );
}
