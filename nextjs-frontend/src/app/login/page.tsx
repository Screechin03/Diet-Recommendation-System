"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { getAccount } from "@/lib/care";

/** Where to go after logging in: doctors to their dashboard; patients back to where they were. */
async function homeAfterLogin(): Promise<string> {
  const next = new URLSearchParams(window.location.search).get("next");
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  try {
    const account = await getAccount();
    if (account.role === "doctor") return safe?.startsWith("/doctor") ? safe : "/doctor";
  } catch {
    // Doctor features not installed: everyone is a patient.
  }
  return safe && !safe.startsWith("/doctor") ? safe : "/";
}

export default function LoginPage() {
  const { user, role } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      router.push(await homeAfterLogin());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (user && role === "doctor") {
    return (
      <div className="mx-auto max-w-xl px-4 py-14">
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60">
          <h1 className="text-2xl font-semibold tracking-tight">You’re signed in as a doctor</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Your patients, reviews and messages are on your dashboard.</p>
          <div className="mt-6">
            <Link href="/doctor" className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white">Open doctor dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-14">
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60">
          <h1 className="text-2xl font-semibold tracking-tight">You are already logged in</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Open your saved recipes or check your recommendation history.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/care" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">
              My care
            </Link>
            <Link href="/saved-recipes" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Saved recipes
            </Link>
            <Link href="/history" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-700">
              History
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <div className="rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-soft dark:border-zinc-800 dark:bg-zinc-900/60">
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Use your Supabase account to save recipes and track your history.
        </p>

        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Email</span>
            <input
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm font-medium">Password</span>
            <div className="relative">
              <input
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-700"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  {showPassword ? (
                    <>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="m3 3 18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.2 17.2 0 0 1-4 4.9" />
                      <path d="M6.6 6.6C4 8.2 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </label>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lift transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
          New here?{" "}
          <Link href="/signup" className="font-medium text-zinc-900 underline dark:text-zinc-100">
            Create an account
          </Link>
        </p>
        <p className="mt-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
          Are you a doctor?{" "}
          <Link href="/doctor/login" className="font-medium text-sky-700 underline dark:text-sky-400">
            Doctor login
          </Link>
        </p>
      </div>
    </div>
  );
}
