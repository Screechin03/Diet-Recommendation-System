"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DoctorAuthShell } from "@/components/care/DoctorAuthShell";
import { Button, doctorInputClass, Notice } from "@/components/care/ui";
import { careErrorMessage, signUpDoctor } from "@/lib/care";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";

const SPECIALTIES = [
  "Obstetrics & Gynaecology",
  "General Practice / Family Medicine",
  "Maternal-Fetal Medicine",
  "Nutrition & Dietetics",
  "Midwifery",
  "Endocrinology",
  "Cardiology",
];

export default function DoctorSignupPage() {
  const router = useRouter();
  const { user, role, refreshAccount } = useAuth();
  const [form, setForm] = useState({ fullName: "", specialty: SPECIALTIES[0], hospital: "", city: "", email: "", password: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    if (busy || !user || !role) return;
    router.replace(role === "doctor" ? "/doctor" : "/care");
  }, [busy, role, router, user]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await signUpDoctor(form);
      if (signedIn) {
        await refreshAccount();
        router.replace("/doctor/profile?welcome=1");
      } else {
        setNeedsConfirm(true);
        setBusy(false);
      }
    } catch (err) {
      setError(careErrorMessage(err, "Sign-up failed."));
      setBusy(false);
    }
  }

  if (needsConfirm) {
    return (
      <DoctorAuthShell title="Check your email" subtitle="Your doctor account has been created.">
        <Notice tone="green">Open the confirmation link we sent to {form.email}, then log in.</Notice>
        <Link href="/doctor/login" className="mt-4 inline-block text-sm font-medium text-sky-700 underline dark:text-sky-400">Go to doctor login</Link>
      </DoctorAuthShell>
    );
  }

  return (
    <DoctorAuthShell title="Create a doctor account" subtitle="Patients will find you by name, hospital and city when they choose their doctor.">
      {!SUPABASE_CONFIGURED ? (
        <Notice tone="amber" title="Accounts aren't configured">Set the Supabase environment variables first.</Notice>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Full name</span>
            <input className={doctorInputClass} value={form.fullName} onChange={set("fullName")} required maxLength={120} placeholder="Dr. Neha Mehta" autoComplete="name" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Speciality</span>
              <select className={doctorInputClass} value={form.specialty} onChange={set("specialty")}>
                {SPECIALTIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">City</span>
              <input className={doctorInputClass} value={form.city} onChange={set("city")} maxLength={80} placeholder="Pune" />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Hospital or clinic</span>
            <input className={doctorInputClass} value={form.hospital} onChange={set("hospital")} maxLength={160} placeholder="City Women’s Hospital" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Email</span>
            <input className={doctorInputClass} type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Password</span>
            <input className={doctorInputClass} type="password" value={form.password} onChange={set("password")} required minLength={6} autoComplete="new-password" />
            <span className="text-xs text-zinc-500">At least 6 characters.</span>
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Doctor access code</span>
            <input className={doctorInputClass} value={form.code} onChange={set("code")} required autoComplete="off" placeholder="Given to you by the MamaCare team" />
          </label>
          {error ? <Notice tone="red">{error}</Notice> : null}
          <Button type="submit" variant="sky" loading={busy}>Create doctor account</Button>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Already registered? <Link href="/doctor/login" className="font-medium text-sky-700 underline dark:text-sky-400">Log in</Link>
          </p>
        </form>
      )}
    </DoctorAuthShell>
  );
}
