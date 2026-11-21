"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Avatar, Button, Card, doctorInputClass, Notice, PageSpinner, Pill } from "@/components/care/ui";
import { careErrorMessage, doctorName, updateDoctorProfile } from "@/lib/care";

export default function DoctorProfilePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <DoctorProfile />
    </Suspense>
  );
}

function DoctorProfile() {
  const { user, account, refreshAccount } = useAuth();
  const doctor = account?.doctor;
  const [form, setForm] = useState({
    full_name: doctor?.full_name ?? "",
    specialty: doctor?.specialty ?? "",
    hospital: doctor?.hospital ?? "",
    city: doctor?.city ?? "",
    bio: doctor?.bio ?? "",
    accepting_patients: doctor?.accepting_patients ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const welcome = useSearchParams().get("welcome") === "1";

  if (!doctor || !user) return null;

  const set = (k: "full_name" | "specialty" | "hospital" | "city" | "bio") => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  async function save() {
    if (!form.full_name.trim()) {
      setError("Your name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateDoctorProfile(doctor!.id, {
        full_name: form.full_name.trim(),
        specialty: form.specialty.trim() || "Obstetrics & Gynaecology",
        hospital: form.hospital.trim() || null,
        city: form.city.trim() || null,
        bio: form.bio.trim() || null,
        accepting_patients: form.accepting_patients,
      });
      await refreshAccount();
      setSaved(true);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't save your profile."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-10">
      <h1 className="text-3xl font-semibold tracking-tight">Your profile</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Patients see this when they choose their doctor.</p>
      {welcome ? (
        <div className="mt-4">
          <Notice tone="green" title="Welcome to MamaCare">
            Your doctor account is ready. Add your hospital, city and a short introduction so patients can find and choose you.
          </Notice>
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-4 p-6">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Full name</span>
            <input className={doctorInputClass} value={form.full_name} onChange={set("full_name")} maxLength={120} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Speciality</span>
              <input className={doctorInputClass} value={form.specialty} onChange={set("specialty")} maxLength={120} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">City</span>
              <input className={doctorInputClass} value={form.city} onChange={set("city")} maxLength={80} />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Hospital or clinic</span>
            <input className={doctorInputClass} value={form.hospital} onChange={set("hospital")} maxLength={160} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">About you</span>
            <textarea className={doctorInputClass} rows={4} value={form.bio} onChange={set("bio")} maxLength={1000} placeholder="Experience, languages you speak, visiting hours…" />
            <span className="text-xs text-zinc-500">{1000 - form.bio.length} characters left</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-sky-600"
              checked={form.accepting_patients}
              onChange={(e) => {
                setSaved(false);
                setForm((f) => ({ ...f, accepting_patients: e.target.checked }));
              }}
            />
            <span>
              <span className="block text-sm font-medium">Accepting new patients</span>
              <span className="block text-xs text-zinc-500">When off, new patients can’t choose you. Current patients stay connected.</span>
            </span>
          </label>
          {error ? <Notice tone="red">{error}</Notice> : null}
          <div className="flex items-center gap-3">
            <Button variant="sky" onClick={() => void save()} loading={busy}>Save profile</Button>
            {saved ? <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved</span> : null}
          </div>
        </Card>

        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Preview</div>
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Avatar name={form.full_name} size={52} tone="blue" />
              <div className="min-w-0">
                <div className="font-semibold">{doctorName(form.full_name)}</div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">{[form.specialty, form.hospital, form.city].filter((v) => v.trim()).join(" · ")}</div>
                {!form.accepting_patients ? <div className="mt-1"><Pill>Not taking new patients</Pill></div> : null}
              </div>
            </div>
            {form.bio.trim() ? <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{form.bio}</p> : null}
          </Card>
          <Card className="p-5 text-sm">
            <div className="font-semibold">Account</div>
            <div className="mt-1 text-zinc-600 dark:text-zinc-400">{user.email}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
