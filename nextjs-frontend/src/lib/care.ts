// Care team: doctor accounts, patient <-> doctor links, shared health records, reviews and messages.
// Database: supabase/schema.sql (parts 2-4). Every access rule is enforced there by row-level security,
// so these helpers never decide who may see what; they only call the API.

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_VERIFIED_PATH, getSupabaseBrowserClient } from "@/lib/supabase";
import type { PregnancyInfo } from "@/lib/types";

export type Role = "patient" | "doctor";
export type RecordKind = "report" | "vitals" | "risk" | "diet_plan";
export type Severity = "normal" | "info" | "attention" | "urgent";
export type ReviewStatus = "none" | "requested" | "reviewed";
export type Verdict = "looks_fine" | "needs_changes" | "see_me";

export interface DoctorProfile {
  id: string;
  full_name: string;
  specialty: string;
  hospital: string | null;
  city: string | null;
  bio: string | null;
  accepting_patients: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientProfile {
  id: string;
  full_name: string | null;
  pregnancy_month: number | null;
  info: Partial<PregnancyInfo>;
  updated_at: string;
}

export interface Account {
  role: Role;
  doctor: DoctorProfile | null;
  patient: PatientProfile | null;
}

export interface CareLink {
  id: string;
  patient_id: string;
  doctor_id: string;
  patient_name: string;
  status: "active" | "ended";
  patient_note: string | null;
  started_at: string;
  doctor_seen_at: string | null;
  ended_at: string | null;
  ended_by: "patient" | "doctor" | null;
  end_reason: string | null;
  doctor?: DoctorProfile | null;
}

export interface RecordSummary {
  id: string;
  patient_id: string;
  kind: RecordKind;
  title: string;
  summary: string | null;
  severity: Severity;
  is_sample: boolean;
  file_name: string | null;
  review_status: ReviewStatus;
  review_requested_at: string | null;
  reviewed_at: string | null;
  reviewer_name: string | null;
  verdict: Verdict | null;
  created_at: string;
}

export interface HealthRecord extends RecordSummary {
  data: Record<string, unknown>;
  file_path: string | null;
  file_mime: string | null;
  file_size: number | null;
}

export interface CareMessage {
  id: string;
  patient_id: string;
  record_id: string | null;
  author_id: string | null;
  author_role: Role;
  author_name: string;
  body: string;
  verdict: Verdict | null;
  created_at: string;
  read_at: string | null;
}

export interface DietInstructions {
  patient_id: string;
  avoid: string[];
  include: string[];
  restrictions: string[];
  note: string | null;
  updated_by_name: string | null;
  updated_at: string;
}

export interface DoctorPatientRow {
  link_id: string;
  patient_id: string;
  patient_name: string;
  pregnancy_month: number | null;
  status: "active" | "ended";
  started_at: string;
  ended_at: string | null;
  ended_by: "patient" | "doctor" | null;
  patient_note: string | null;
  is_new: boolean;
  records_count: number;
  pending_reviews: number;
  urgent_pending: number;
  unread_messages: number;
  last_activity: string | null;
  last_record_title: string | null;
  last_record_severity: Severity | null;
}

export interface InboxItem {
  item_type: "urgent" | "review" | "message" | "new_patient";
  priority: number;
  patient_id: string;
  patient_name: string;
  record_id: string | null;
  record_kind: RecordKind | null;
  record_title: string | null;
  severity: Severity | null;
  preview: string | null;
  item_count: number;
  at: string;
}

export interface NewRecord {
  kind: RecordKind;
  title: string;
  summary: string | null;
  severity: Severity;
  data: Record<string, unknown>;
  is_sample?: boolean;
  /** Ask the doctor to review right away. */
  requestReview?: boolean;
}

// ---------------------------------------------------------------------------------------------------------
// Display copy shared by patient and doctor screens
// ---------------------------------------------------------------------------------------------------------

export const KIND_COPY: Record<RecordKind, { label: string; plural: string }> = {
  report: { label: "Report", plural: "Reports" },
  vitals: { label: "Vital signs", plural: "Vital signs" },
  risk: { label: "Risk check", plural: "Risk checks" },
  diet_plan: { label: "Diet plan", plural: "Diet plans" },
};

export const VERDICT_COPY: Record<Verdict, { label: string; tone: "green" | "amber" | "red"; patientLine: string }> = {
  looks_fine: { label: "Looks fine", tone: "green", patientLine: "Your doctor checked this and it looks fine." },
  needs_changes: { label: "Changes needed", tone: "amber", patientLine: "Your doctor suggests some changes. Read the note below." },
  see_me: { label: "See me soon", tone: "red", patientLine: "Your doctor would like to see you. Please book a visit." },
};

export const SEVERITY_COPY: Record<Severity, { label: string; tone: "green" | "gray" | "amber" | "red" }> = {
  normal: { label: "Normal", tone: "green" },
  info: { label: "For information", tone: "gray" },
  attention: { label: "Needs attention", tone: "amber" },
  urgent: { label: "Urgent", tone: "red" },
};

export function doctorName(name: string | null | undefined): string {
  const n = (name ?? "").trim() || "your doctor";
  return /^dr\.?\s/i.test(n) || n === "your doctor" ? n : `Dr. ${n}`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------

/** Turns API errors into a sentence a patient or doctor can act on. */
export function careErrorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e instanceof TypeError) return "Couldn't reach the server. Check your internet connection.";
  const err = e as Partial<PostgrestError> & { message?: string; status?: number; statusCode?: string };
  const code = err?.code ?? "";
  const msg = err?.message ?? (typeof e === "string" ? e : "");
  if (code === "PGRST202" || code === "42883" || code === "PGRST205" || code === "42P01") {
    return "Doctor features aren't set up on the server yet. Run supabase/schema.sql in Supabase.";
  }
  if (/row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  if (/JWT|not authenticated|Please log in/i.test(msg)) return "Your session has ended. Please log in again.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Couldn't reach the server. Check your internet connection.";
  if (/Bucket not found/i.test(msg)) return "File storage isn't set up yet. Run supabase/schema.sql in Supabase.";
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) return "That file is too large (10 MB at most).";
  if (/mime type .* is not supported|invalid_mime_type/i.test(msg)) return "That file type can't be stored. Use a PDF, JPG, PNG or WebP file.";
  return msg || fallback;
}

function check<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw res.error;
  return res.data;
}

function db(): SupabaseClient {
  return getSupabaseBrowserClient();
}

/** Lets open pages and the header badge refresh after something changed (a message sent, a review, ...). */
export function notifyCareChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("care:changed"));
}

// ---------------------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------------------

export async function getAccount(): Promise<Account> {
  return check(await db().rpc("my_account")) as Account;
}

export async function checkDoctorCode(code: string): Promise<boolean> {
  return Boolean(check(await db().rpc("check_doctor_code", { p_code: code })));
}

export interface DoctorSignup {
  email: string;
  password: string;
  fullName: string;
  specialty: string;
  hospital: string;
  city: string;
  code: string;
}

/** Returns true when the doctor is signed in straight away (email confirmation off). */
export async function signUpDoctor(input: DoctorSignup): Promise<boolean> {
  if (!(await checkDoctorCode(input.code))) {
    throw new Error("That doctor access code isn't right. Ask the MamaCare team for the current code.");
  }
  const { data, error } = await db().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: `${window.location.origin}${EMAIL_VERIFIED_PATH}`,
      data: {
        full_name: input.fullName.trim(),
        account_type: "doctor",
        doctor_code: input.code.trim(),
        specialty: input.specialty.trim() || null,
        hospital: input.hospital.trim() || null,
        city: input.city.trim() || null,
      },
    },
  });
  if (error) {
    if (/already registered/i.test(error.message)) throw new Error("This email already has an account. Log in instead.");
    if (/Database error/i.test(error.message)) throw new Error("The account couldn't be created. Check the access code and try again.");
    throw error;
  }
  return Boolean(data.session);
}

export async function updateDoctorProfile(
  id: string,
  patch: Partial<Pick<DoctorProfile, "full_name" | "specialty" | "hospital" | "city" | "bio" | "accepting_patients">>,
): Promise<DoctorProfile> {
  return check(await db().from("doctor_profiles").update(patch).eq("id", id).select("*").single()) as DoctorProfile;
}

export async function getPatientProfile(id: string): Promise<PatientProfile | null> {
  return check(await db().from("patient_profiles").select("*").eq("id", id).maybeSingle()) as PatientProfile | null;
}

/** Keeps the profile the doctor sees in sync with what the patient last entered. */
export async function savePatientProfile(id: string, info: PregnancyInfo, fullName?: string | null): Promise<void> {
  const row: Record<string, unknown> = { id, info, pregnancy_month: info.pregnancy_month ?? null };
  if (fullName !== undefined) row.full_name = fullName;
  check(await db().from("patient_profiles").upsert(row, { onConflict: "id" }));
}

/** Keeps the month the doctor sees current when the patient enters it in a tool (e.g. vitals). */
export async function updatePregnancyMonth(id: string, month: number): Promise<void> {
  check(await db().from("patient_profiles").update({ pregnancy_month: month }).eq("id", id));
}

// ---------------------------------------------------------------------------------------------------------
// Doctors and care links
// ---------------------------------------------------------------------------------------------------------

export async function listDoctors(): Promise<DoctorProfile[]> {
  return (check(await db().from("doctor_profiles").select("*").order("full_name")) ?? []) as DoctorProfile[];
}

/** All of a patient's links (newest first), each with its doctor. The active one, if any, is first. */
export async function getCareLinks(patientId: string): Promise<CareLink[]> {
  const rows = (check(
    await db()
      .from("care_links")
      .select("*, doctor:doctor_profiles(*)")
      .eq("patient_id", patientId)
      .order("started_at", { ascending: false }),
  ) ?? []) as CareLink[];
  return [...rows.filter((r) => r.status === "active"), ...rows.filter((r) => r.status !== "active")];
}

export async function assignDoctor(doctorId: string, note: string | null): Promise<CareLink> {
  const link = check(await db().rpc("assign_doctor", { p_doctor_id: doctorId, p_note: note })) as CareLink;
  notifyCareChanged();
  return link;
}

export async function endCare(linkId: string, reason: string | null): Promise<void> {
  check(await db().rpc("end_care", { p_link_id: linkId, p_reason: reason }));
  notifyCareChanged();
}

// ---------------------------------------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------------------------------------

const SUMMARY_COLUMNS =
  "id, patient_id, kind, title, summary, severity, is_sample, file_name, review_status, review_requested_at, reviewed_at, reviewer_name, verdict, created_at";

export const FILES_BUCKET = "medical-files";

export async function listRecords(patientId: string, limit = 200): Promise<RecordSummary[]> {
  return (check(
    await db()
      .from("patient_records")
      .select(SUMMARY_COLUMNS)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) ?? []) as RecordSummary[];
}

export async function listRecordsOfKind(patientId: string, kind: RecordKind, limit = 50): Promise<HealthRecord[]> {
  return (check(
    await db()
      .from("patient_records")
      .select("*")
      .eq("patient_id", patientId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) ?? []) as HealthRecord[];
}

export async function getRecord(id: string): Promise<HealthRecord | null> {
  return check(await db().from("patient_records").select("*").eq("id", id).maybeSingle()) as HealthRecord | null;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] || "bin";
}

/** Saves a record for the signed-in patient, with the original document if given. Returns the new record. */
export async function saveRecord(patientId: string, input: NewRecord, file?: File | null): Promise<RecordSummary> {
  const client = db();
  let filePath: string | null = null;
  if (file) {
    filePath = `${patientId}/${crypto.randomUUID()}.${extensionFor(file)}`;
    const up = await client.storage.from(FILES_BUCKET).upload(filePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) throw up.error;
  }
  const res = await client
    .from("patient_records")
    .insert({
      patient_id: patientId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      summary: input.summary ? input.summary.slice(0, 500) : null,
      severity: input.severity,
      data: input.data,
      is_sample: Boolean(input.is_sample),
      review_status: input.requestReview ? "requested" : "none",
      file_path: filePath,
      file_name: file ? file.name.slice(0, 200) : null,
      file_mime: file ? (file.type || null) : null,
      file_size: file ? file.size : null,
    })
    .select(SUMMARY_COLUMNS)
    .single();
  if (res.error) {
    if (filePath) await client.storage.from(FILES_BUCKET).remove([filePath]);
    throw res.error;
  }
  notifyCareChanged();
  return res.data as RecordSummary;
}

export async function deleteRecord(record: Pick<HealthRecord, "id" | "file_path">): Promise<void> {
  const client = db();
  check(await client.from("patient_records").delete().eq("id", record.id));
  if (record.file_path) await client.storage.from(FILES_BUCKET).remove([record.file_path]);
  notifyCareChanged();
}

export async function requestReview(recordId: string, note: string | null): Promise<RecordSummary> {
  const rec = check(await db().rpc("request_review", { p_record_id: recordId, p_note: note })) as RecordSummary;
  notifyCareChanged();
  return rec;
}

/** A short-lived link to the original document (works for the patient and her current doctor). */
export async function fileUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from(FILES_BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------------------------------------
// Messages and reviews
// ---------------------------------------------------------------------------------------------------------

export async function listMessages(patientId: string, recordId: string | null): Promise<CareMessage[]> {
  let q = db().from("care_messages").select("*").eq("patient_id", patientId);
  q = recordId ? q.eq("record_id", recordId) : q.is("record_id", null);
  return (check(await q.order("created_at", { ascending: true }).limit(500)) ?? []) as CareMessage[];
}

export async function sendMessage(
  patientId: string,
  body: string,
  recordId: string | null = null,
  verdict: Verdict | null = null,
): Promise<CareMessage> {
  const msg = check(
    await db().rpc("send_care_message", { p_patient_id: patientId, p_body: body, p_record_id: recordId, p_verdict: verdict }),
  ) as CareMessage;
  notifyCareChanged();
  return msg;
}

export async function markThreadRead(patientId: string, recordId: string | null): Promise<void> {
  const n = check(await db().rpc("mark_thread_read", { p_patient_id: patientId, p_record_id: recordId })) as number;
  if (n > 0) notifyCareChanged();
}

/** Unread messages from the doctor, for the patient: total and per record ("general" = conversation). */
export async function patientUnread(patientId: string): Promise<{ total: number; byRecord: Record<string, number> }> {
  const rows = (check(
    await db()
      .from("care_messages")
      .select("record_id")
      .eq("patient_id", patientId)
      .eq("author_role", "doctor")
      .is("read_at", null)
      .limit(1000),
  ) ?? []) as Array<{ record_id: string | null }>;
  const byRecord: Record<string, number> = {};
  for (const r of rows) byRecord[r.record_id ?? "general"] = (byRecord[r.record_id ?? "general"] ?? 0) + 1;
  return { total: rows.length, byRecord };
}

/** Unread messages from the patient, for her doctor, per record ("general" = conversation). */
export async function doctorUnreadForPatient(patientId: string): Promise<Record<string, number>> {
  const rows = (check(
    await db()
      .from("care_messages")
      .select("record_id")
      .eq("patient_id", patientId)
      .eq("author_role", "patient")
      .is("read_at", null)
      .limit(1000),
  ) ?? []) as Array<{ record_id: string | null }>;
  const byRecord: Record<string, number> = {};
  for (const r of rows) byRecord[r.record_id ?? "general"] = (byRecord[r.record_id ?? "general"] ?? 0) + 1;
  return byRecord;
}

// ---------------------------------------------------------------------------------------------------------
// Diet instructions
// ---------------------------------------------------------------------------------------------------------

export async function getDietInstructions(patientId: string): Promise<DietInstructions | null> {
  return check(
    await db().from("diet_instructions").select("*").eq("patient_id", patientId).maybeSingle(),
  ) as DietInstructions | null;
}

export async function setDietInstructions(
  patientId: string,
  value: { avoid: string[]; include: string[]; restrictions: string[]; note: string | null },
): Promise<DietInstructions> {
  const row = check(
    await db().rpc("set_diet_instructions", {
      p_patient_id: patientId,
      p_avoid: value.avoid,
      p_include: value.include,
      p_restrictions: value.restrictions,
      p_note: value.note,
    }),
  ) as DietInstructions;
  notifyCareChanged();
  return row;
}

export function hasDietInstructions(d: DietInstructions | null | undefined): d is DietInstructions {
  return Boolean(d && (d.avoid.length || d.include.length || d.restrictions.length || d.note));
}

// ---------------------------------------------------------------------------------------------------------
// Doctor dashboard
// ---------------------------------------------------------------------------------------------------------

export async function doctorPatients(): Promise<DoctorPatientRow[]> {
  return (check(await db().rpc("doctor_patients")) ?? []) as DoctorPatientRow[];
}

export async function doctorInbox(): Promise<InboxItem[]> {
  return (check(await db().rpc("doctor_inbox")) ?? []) as InboxItem[];
}

export async function markPatientSeen(linkId: string): Promise<void> {
  check(await db().rpc("mark_patient_seen", { p_link_id: linkId }));
  notifyCareChanged();
}
