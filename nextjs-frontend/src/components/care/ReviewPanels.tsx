"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon } from "@/components/report/icons";
import { Thread } from "@/components/care/Thread";
import { Button, buttonClass, Card, ClockIcon, doctorInputClass, Pill } from "@/components/care/ui";
import {
  careErrorMessage,
  doctorName,
  formatDateTime,
  requestReview,
  sendMessage,
  timeAgo,
  VERDICT_COPY,
  type CareLink,
  type HealthRecord,
  type Verdict,
} from "@/lib/care";

const VERDICT_STYLE: Record<Verdict, { on: string; ring: string; text: string }> = {
  looks_fine: {
    on: "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40",
    ring: "ring-emerald-500/15",
    text: "text-emerald-800 dark:text-emerald-300",
  },
  needs_changes: {
    on: "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40",
    ring: "ring-amber-500/15",
    text: "text-amber-800 dark:text-amber-300",
  },
  see_me: {
    on: "border-rose-400 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/40",
    ring: "ring-rose-500/15",
    text: "text-rose-800 dark:text-rose-300",
  },
};

const VERDICT_HINT: Record<Verdict, string> = {
  looks_fine: "Nothing to change. Reassure the patient.",
  needs_changes: "Explain what to change (diet, medicine timing, follow-up test).",
  see_me: "Ask the patient to book a visit or come in.",
};

function VerdictBanner({ record }: { record: HealthRecord }) {
  if (record.review_status !== "reviewed" || !record.verdict) return null;
  const v = VERDICT_COPY[record.verdict];
  const s = VERDICT_STYLE[record.verdict];
  return (
    <div className={`rounded-2xl border p-4 ${s.on}`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${s.text}`}>
        <CheckIcon size={16} /> {v.label}
      </div>
      <p className="mt-1 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{v.patientLine}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {doctorName(record.reviewer_name)} · {formatDateTime(record.reviewed_at)}
      </p>
    </div>
  );
}

/** Patient side of a record: the doctor's verdict, asking for a review, and the conversation about it. */
export function PatientReviewPanel({
  record,
  active,
  onChanged,
}: {
  record: HealthRecord;
  active: CareLink | null;
  onChanged: (r: HealthRecord) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doctor = active?.doctor ?? null;
  const dr = doctor ? doctorName(doctor.full_name) : null;

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const r = await requestReview(record.id, note.trim() || null);
      onChanged({ ...record, ...r });
      setAsking(false);
      setNote("");
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't send the request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Doctor’s review</h3>
        <div className="mt-3 space-y-3">
          <VerdictBanner record={record} />
          {record.review_status === "requested" ? (
            <div className="flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
              <ClockIcon size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Waiting for {dr ?? "a doctor"} to review</div>
                <div className="text-sky-800/80 dark:text-sky-300/80">
                  Requested {timeAgo(record.review_requested_at)}.{" "}
                  {doctor ? "You’ll see the reply here." : "Choose a doctor and it will be in their inbox."}
                </div>
              </div>
            </div>
          ) : null}
          {record.review_status === "none" && !doctor ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Not reviewed yet. Choose a doctor to get your records reviewed.</p>
          ) : null}
          {record.review_status === "none" && doctor ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{dr} can see this record. Ask for a review if you’d like their opinion.</p>
          ) : null}

          {doctor && record.review_status !== "requested" ? (
            asking ? (
              <div className="space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  autoFocus
                  placeholder={`What would you like ${dr} to look at? (optional)`}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-950"
                />
                <div className="flex gap-2">
                  <Button variant="emerald" size="sm" onClick={() => void ask()} loading={busy}>Send request</Button>
                  <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant={record.review_status === "reviewed" ? "secondary" : "emerald"} size="sm" onClick={() => setAsking(true)}>
                {record.review_status === "reviewed" ? `Ask ${dr} again` : `Ask ${dr} to review`}
              </Button>
            )
          ) : null}
          {!doctor ? (
            <Link href={`/care/doctors?next=${encodeURIComponent(`/care/records/${record.id}`)}`} className={buttonClass("emerald", "sm")}>
              Choose a doctor
            </Link>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Comments</h3>
        <Thread
          patientId={record.patient_id}
          recordId={record.id}
          canWrite={Boolean(doctor)}
          disabledReason="Choose a doctor to comment on your records."
          placeholder={dr ? `Ask ${dr} about this record…` : ""}
          emptyText="No comments yet."
          maxHeight={360}
        />
      </Card>
    </div>
  );
}

/** Doctor side of a record: give a verdict with a note, then keep discussing in the comments. */
export function DoctorReviewPanel({ record, onReviewed }: { record: HealthRecord; onReviewed: () => void }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  async function submit() {
    if (!verdict) return;
    setBusy(true);
    setError(null);
    try {
      await sendMessage(record.patient_id, note.trim(), record.id, verdict);
      setNote("");
      setVerdict(null);
      setJustSent(true);
      onReviewed();
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't send the review."));
    } finally {
      setBusy(false);
    }
  }

  const status =
    record.review_status === "requested" ? (
      <Pill tone="blue">Review requested {timeAgo(record.review_requested_at)}</Pill>
    ) : record.review_status === "reviewed" && record.verdict ? (
      <Pill tone={VERDICT_COPY[record.verdict].tone} dot>
        {VERDICT_COPY[record.verdict].label} · {doctorName(record.reviewer_name)}
      </Pill>
    ) : (
      <Pill>Not reviewed</Pill>
    );

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Your review</h3>
          {status}
        </div>
        {justSent ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            Review sent. The patient sees it straight away.
          </p>
        ) : null}
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Review result</legend>
          {(Object.keys(VERDICT_COPY) as Verdict[]).map((v) => {
            const on = verdict === v;
            const s = VERDICT_STYLE[v];
            return (
              <label
                key={v}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  on ? `${s.on} ring-4 ${s.ring}` : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                }`}
              >
                <input type="radio" name="verdict" className="mt-1 accent-sky-600" checked={on} onChange={() => setVerdict(v)} />
                <span>
                  <span className={`block text-sm font-semibold ${on ? s.text : ""}`}>{VERDICT_COPY[v].label}</span>
                  <span className="block text-xs text-zinc-500">{VERDICT_HINT[v]}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Note to the patient {verdict === "looks_fine" ? "(optional)" : ""}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="e.g. Haemoglobin is a little low. Keep taking iron after dinner and add spinach or dates daily."
            className={doctorInputClass}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        <Button variant="sky" className="mt-3 w-full" onClick={() => void submit()} loading={busy} disabled={!verdict}>
          {record.review_status === "reviewed" ? "Send updated review" : "Send review"}
        </Button>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Comments with the patient</h3>
        <Thread
          patientId={record.patient_id}
          recordId={record.id}
          canWrite
          accent="sky"
          placeholder="Reply to the patient about this record…"
          emptyText="No comments on this record yet."
          maxHeight={360}
        />
      </Card>
    </div>
  );
}
