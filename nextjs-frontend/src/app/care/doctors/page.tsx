"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCareLinks } from "@/components/care/hooks";
import { RequireRole } from "@/components/care/RequireRole";
import { Avatar, BackLink, Button, Card, EmptyState, inputClass, Notice, Pill, SearchIcon, Spinner, UsersIcon } from "@/components/care/ui";
import { assignDoctor, careErrorMessage, doctorName, listDoctors, type DoctorProfile } from "@/lib/care";

export default function ChooseDoctorPage() {
  return (
    <RequireRole role="patient">
      <ChooseDoctor />
    </RequireRole>
  );
}

/** Only same-site paths are allowed as the return address. */
function safeNext(): string {
  if (typeof window === "undefined") return "/care";
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/care";
}

function ChooseDoctor() {
  const router = useRouter();
  const { active, loading: linksLoading } = useCareLinks();
  const [doctors, setDoctors] = useState<DoctorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    listDoctors()
      .then(setDoctors)
      .catch((e) => setError(careErrorMessage(e, "Couldn't load the doctor list.")));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = doctors ?? [];
    const filtered = q
      ? list.filter((d) => [d.full_name, d.specialty, d.hospital, d.city].some((v) => v?.toLowerCase().includes(q)))
      : list;
    // Current doctor first, then doctors accepting patients.
    return [...filtered].sort(
      (a, b) =>
        Number(b.id === active?.doctor_id) - Number(a.id === active?.doctor_id) ||
        Number(b.accepting_patients) - Number(a.accepting_patients),
    );
  }, [doctors, query, active]);

  async function connect(d: DoctorProfile) {
    setBusy(true);
    setAssignError(null);
    try {
      await assignDoctor(d.id, note.trim() || null);
      router.push(safeNext());
    } catch (e) {
      setAssignError(careErrorMessage(e, "Couldn't connect. Please try again."));
      setBusy(false);
    }
  }

  const current = active?.doctor ?? null;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-10">
      <BackLink href="/care">My care</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{current ? "Change your doctor" : "Choose your doctor"}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        You’re connected as soon as you choose. Your doctor can then see your saved records, review them, send you diet
        instructions and message you.
        {current ? ` ${doctorName(current.full_name)} will stop seeing your records when you switch, and your new doctor will see your full history.` : ""}
      </p>

      <div className="relative mt-6">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400"><SearchIcon size={16} /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, hospital, city or speciality"
          aria-label="Search doctors"
          className={`${inputClass} pl-9`}
        />
      </div>

      <div className="mt-5 space-y-3">
        {error ? <Notice tone="red">{error}</Notice> : null}
        {doctors === null && !error ? (
          <div className="flex items-center gap-2 py-8 text-sm text-zinc-500"><Spinner /> Loading doctors…</div>
        ) : null}
        {doctors && !shown.length ? (
          <EmptyState
            icon={<UsersIcon size={28} />}
            title={doctors.length ? "No doctors match your search" : "No doctors have joined yet"}
            text={doctors.length ? "Try a different name or city." : "Once a doctor creates an account, they will appear here."}
          />
        ) : null}

        {shown.map((d) => {
          const isCurrent = d.id === active?.doctor_id;
          const open = selected === d.id;
          return (
            <Card key={d.id} className={`p-5 transition ${open ? "ring-4 ring-emerald-500/15" : ""}`}>
              <div className="flex flex-wrap items-start gap-4">
                <Avatar name={d.full_name} size={52} tone="blue" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{doctorName(d.full_name)}</span>
                    {isCurrent ? <Pill tone="green" dot>Your doctor</Pill> : null}
                    {!d.accepting_patients && !isCurrent ? <Pill>Not taking new patients</Pill> : null}
                  </div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">{[d.specialty, d.hospital, d.city].filter(Boolean).join(" · ")}</div>
                  {d.bio ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{d.bio}</p> : null}
                </div>
                {!isCurrent && d.accepting_patients && !open ? (
                  <Button variant="emerald" size="sm" onClick={() => { setSelected(d.id); setNote(""); setAssignError(null); }} disabled={linksLoading}>
                    {current ? "Switch to this doctor" : "Choose"}
                  </Button>
                ) : null}
              </div>

              {open ? (
                <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Anything {doctorName(d.full_name)} should know? (optional)
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      autoFocus
                      placeholder="e.g. Due in March, first pregnancy, iron was low at my last check-up."
                      className={inputClass}
                    />
                  </label>
                  {current ? (
                    <Notice tone="amber">{doctorName(current.full_name)} will no longer be able to see your records or message you.</Notice>
                  ) : null}
                  {assignError ? <p className="text-sm text-rose-600">{assignError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="emerald" onClick={() => void connect(d)} loading={busy}>
                      Connect with {doctorName(d.full_name)}
                    </Button>
                    <Button variant="ghost" onClick={() => setSelected(null)} disabled={busy}>Cancel</Button>
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
