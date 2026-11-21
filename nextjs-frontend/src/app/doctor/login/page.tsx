"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DoctorAuthShell } from "@/components/care/DoctorAuthShell";
import { Button, doctorInputClass, Notice } from "@/components/care/ui";
import { careErrorMessage, getAccount } from "@/lib/care";
import { getSupabaseBrowserClient, SUPABASE_CONFIGURED } from "@/lib/supabase";

function safeNext(): string | null {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/doctor") && !next.startsWith("//") ? next : null;
}

export default function DoctorLoginPage() {
  const router = useRouter();
  const { user, role } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in: go to the right home.
  useEffect(() => {
    if (busy || !user || !role) return;
    router.replace(role === "doctor" ? safeNext() ?? "/doctor" : "/care");
  }, [busy, role, router, user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      const account = await getAccount();
      // A patient who used this page goes to the patient side.
      router.replace(account.role === "doctor" ? safeNext() ?? "/doctor" : "/care");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(/Invalid login credentials/i.test(msg) ? "Wrong email or password." : careErrorMessage(err, "Login failed."));
      setBusy(false);
    }
  }

  return (
    <DoctorAuthShell title="Doctor login" subtitle="Sign in to see your patients’ records, reviews and messages.">
      {!SUPABASE_CONFIGURED ? (
        <Notice tone="amber" title="Accounts aren't configured">Set the Supabase environment variables first.</Notice>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Email</span>
            <input className={doctorInputClass} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Password</span>
            <input className={doctorInputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>
          {error ? <Notice tone="red">{error}</Notice> : null}
          <Button type="submit" variant="sky" loading={busy}>Log in</Button>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            New to MamaCare?{" "}
            <Link href="/doctor/signup" className="font-medium text-sky-700 underline dark:text-sky-400">Create a doctor account</Link>
          </p>
          <p className="border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
            Are you a patient? <Link href="/login" className="underline">Patient login</Link>
          </p>
        </form>
      )}
    </DoctorAuthShell>
  );
}
