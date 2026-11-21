"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCareLinks } from "@/components/care/hooks";
import { Avatar, Button, buttonClass, Pill, Spinner, StethoscopeBadge } from "@/components/care/ui";
import { careErrorMessage, doctorName, requestReview, saveRecord, type NewRecord, type RecordSummary } from "@/lib/care";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";

/**
 * Under each tool result: save it to the patient's records (her doctor sees it automatically) and,
 * optionally, ask the doctor to review it. Without a doctor, "Save & choose a doctor" saves first (so the
 * result isn't lost), then opens the doctor list and comes back to the saved record.
 * Give it a new `key` for each new result.
 */
export function ShareWithDoctor({
  build,
  file,
  what = "this result",
  onSaved,
}: {
  build: () => NewRecord;
  file?: File | null;
  what?: string;
  onSaved?: (record: RecordSummary) => void;
}) {
  const router = useRouter();
  const { user, role, roleLoading, careAvailable } = useAuth();
  const { active, loading: linksLoading } = useCareLinks();
  const [saved, setSaved] = useState<RecordSummary | null>(null);
  const [busy, setBusy] = useState<null | "save" | "review">(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  }, [build]);

  const isPatient = Boolean(user) && role === "patient";

  async function save(withReview: boolean, thenChooseDoctor = false) {
    if (!user) return;
    setBusy(withReview ? "review" : "save");
    setError(null);
    try {
      const record = await saveRecord(user.id, { ...buildRef.current(), requestReview: withReview }, file);
      setSaved(record);
      onSaved?.(record);
      if (thenChooseDoctor) router.push(`/care/doctors?next=${encodeURIComponent(`/care/records/${record.id}`)}`);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't save this. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function ask() {
    if (!saved) return;
    setBusy("review");
    setError(null);
    try {
      setSaved(await requestReview(saved.id, note.trim() || null));
      setAsking(false);
      setNote("");
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't send the request."));
    } finally {
      setBusy(null);
    }
  }

  if (!SUPABASE_CONFIGURED || roleLoading || role === "doctor") return null;
  if (user && !careAvailable) return null;

  const doctor = active?.doctor ?? null;
  const dr = doctor ? doctorName(doctor.full_name) : null;

  if (!user) {
    return (
      <Shell>
        <div className="flex flex-wrap items-center gap-4">
          <StethoscopeBadge />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Keep {what} and share it with your doctor</div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Sign in to save it to your records. Your doctor sees it on their dashboard and can reply.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/login" className={buttonClass("primary", "sm")}>Log in</Link>
            <Link href="/signup" className={buttonClass("secondary", "sm")}>Create account</Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (saved) {
    const requested = saved.review_status === "requested";
    return (
      <Shell tone="green">
        <div className="flex flex-wrap items-start gap-4">
          {doctor ? <Avatar name={doctor.full_name} size={44} tone="blue" /> : <StethoscopeBadge />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              Saved to your records
              {requested ? <Pill tone="blue">Review requested</Pill> : null}
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {doctor
                ? requested
                  ? `${dr} has been asked to review it. You'll see the reply in your records.`
                  : `${dr} can see it on their dashboard.`
                : "Choose a doctor to have it reviewed."}
            </p>
            {asking ? (
              <div className="mt-3 space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={4000}
                  placeholder={`Anything you'd like to ask ${dr}? (optional)`}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-950"
                />
                <div className="flex gap-2">
                  <Button variant="emerald" size="sm" onClick={() => void ask()} loading={busy === "review"}>Send request</Button>
                  <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>Cancel</Button>
                </div>
              </div>
            ) : null}
            {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {doctor && !requested && !asking ? (
              <Button variant="emerald" size="sm" onClick={() => setAsking(true)}>Ask {dr} to review</Button>
            ) : null}
            {!doctor ? (
              <Link href={`/care/doctors?next=${encodeURIComponent(`/care/records/${saved.id}`)}`} className={buttonClass("emerald", "sm")}>
                Choose a doctor
              </Link>
            ) : null}
            <Link href={`/care/records/${saved.id}`} className={buttonClass("secondary", "sm")}>Open record</Link>
          </div>
        </div>
      </Shell>
    );
  }

  if (!isPatient || linksLoading) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <Spinner size={15} /> Loading…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-4">
        {doctor ? <Avatar name={doctor.full_name} size={44} tone="blue" /> : <StethoscopeBadge />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{doctor ? `Share with ${dr}` : `Get ${what} reviewed by a doctor`}</div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {doctor
              ? `Saved records appear on ${dr}'s dashboard. Ask for a review if you'd like their opinion.`
              : "Save it to your records and choose a doctor. They'll see it straight away and can reply."}
          </p>
          {error ? <p className="mt-1 text-sm text-rose-600">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="emerald"
            size="sm"
            onClick={() => void save(true, !doctor)}
            loading={busy === "review"}
            disabled={busy !== null}
          >
            {doctor ? `Save & ask ${dr} to review` : "Save & choose a doctor"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void save(false)} loading={busy === "save"} disabled={busy !== null}>
            Just save
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" }) {
  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${
        tone === "green"
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      }`}
      aria-live="polite"
    >
      {children}
    </section>
  );
}
