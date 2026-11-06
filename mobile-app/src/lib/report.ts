// Shared with nextjs-frontend/src/lib/report.ts (keep the two in sync).
// Normalizes the prescription-reader API response. Gemini output is JSON but its exact shape varies
// (strings vs objects, missing keys), so every field is coerced defensively before rendering.

export type OcrQuality = "clear" | "partial" | "unreadable" | "no_text";

export interface OcrChar {
  char: string;
  confidence: number;
  box: [number, number, number, number];
}

export interface OcrResult {
  engine: string;
  quality: OcrQuality;
  message: string;
  text: string;
  lines: Array<{ text: string; confidence: number }>;
  avg_confidence: number;
  character_count: number;
  chars: OcrChar[];
  image_size: [number, number];
  annotated_image: string | null;
}

export interface FileInfo {
  filename: string;
  mime_type: string;
  size_bytes: number;
}

export interface PrescriptionApiResponse {
  success: boolean;
  file: FileInfo;
  extracted?: Record<string, unknown> | null;
  diet_plan?: Record<string, unknown> | null;
  ocr?: OcrResult | null;
  error?: string | null;
}

export interface HandwritingApiResponse {
  success: boolean;
  file: FileInfo;
  ocr?: OcrResult | null;
  error?: string | null;
}

export interface Medication {
  name: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  notes?: string;
}

export interface LabTest {
  name: string;
  value?: string;
  unit?: string;
  reference_range?: string;
  flag?: "high" | "low" | "abnormal" | "normal" | string;
}

export interface ExtractedReport {
  patient: { name?: string; age?: string; sex?: string };
  document: { type?: string; date?: string; provider?: string };
  diagnoses: string[];
  medications: Medication[];
  tests: LabTest[];
  instructions: string[];
  dietary_notes: string[];
  follow_up: string[];
  allergies: string[];
  uncertainties: string[];
}

export interface DietPlan {
  title: string;
  summary: string;
  do: string[];
  avoid: string[];
  meal_ideas: string[];
  questions_for_doctor: string[];
  safety_notes: string[];
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Any list-ish value → list of readable strings (objects are flattened "a · b · c"). */
export function strList(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  return arr
    .map((item) => {
      const s = str(item);
      if (s) return s;
      const o = obj(item);
      return Object.values(o).map(str).filter(Boolean).join(" · ") || undefined;
    })
    .filter((s): s is string => Boolean(s));
}

export function normalizeReport(raw: unknown): ExtractedReport | null {
  const r = obj(raw);
  if (!Object.keys(r).length) return null;
  const patient = obj(r.patient);
  const doc = obj(r.document);

  const medications: Medication[] = (Array.isArray(r.medications) ? r.medications : [])
    .map((m): Medication | null => {
      if (typeof m === "string") return m.trim() ? { name: m.trim() } : null;
      const o = obj(m);
      const name = str(o.name) ?? str(o.drug) ?? str(o.medicine);
      if (!name) return null;
      return { name, dose: str(o.dose), frequency: str(o.frequency), duration: str(o.duration), notes: str(o.notes) };
    })
    .filter((m): m is Medication => m !== null);

  const tests: LabTest[] = (Array.isArray(r.tests) ? r.tests : [])
    .map((t): LabTest | null => {
      if (typeof t === "string") return t.trim() ? { name: t.trim() } : null;
      const o = obj(t);
      const name = str(o.name) ?? str(o.test);
      if (!name) return null;
      return {
        name,
        value: str(o.value) ?? str(o.result),
        unit: str(o.unit),
        reference_range: str(o.reference_range) ?? str(o.range),
        flag: str(o.flag)?.toLowerCase(),
      };
    })
    .filter((t): t is LabTest => t !== null);

  return {
    patient: { name: str(patient.name), age: str(patient.age), sex: str(patient.sex) },
    document: { type: str(doc.type), date: str(doc.date), provider: str(doc.provider) },
    diagnoses: strList(r.diagnoses),
    medications,
    tests,
    instructions: strList(r.instructions),
    dietary_notes: strList(r.dietary_notes),
    follow_up: strList(r.follow_up),
    allergies: strList(r.allergies),
    uncertainties: strList(r.uncertainties).filter((u) => u.length < 400),
  };
}

export function normalizeDietPlan(raw: unknown): DietPlan | null {
  const r = obj(raw);
  if (!Object.keys(r).length) return null;
  return {
    title: str(r.title) ?? "Diet plan",
    summary: str(r.summary) ?? "",
    do: strList(r.do),
    avoid: strList(r.avoid),
    meal_ideas: strList(r.meal_ideas),
    questions_for_doctor: strList(r.questions_for_doctor),
    safety_notes: strList(r.safety_notes),
  };
}

export function isEmptyReport(r: ExtractedReport | null): boolean {
  if (!r) return true;
  return (
    !r.medications.length &&
    !r.tests.length &&
    !r.diagnoses.length &&
    !r.instructions.length &&
    !r.dietary_notes.length &&
    !r.follow_up.length &&
    !r.allergies.length &&
    !r.patient.name &&
    !r.document.type
  );
}

export function humanizeDocType(t?: string): string {
  if (!t) return "Medical document";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const QUALITY_LABEL: Record<OcrQuality, string> = {
  clear: "Read clearly",
  partial: "Partly readable",
  unreadable: "Not readable by scanner",
  no_text: "No writing found",
};

/** Turns API/network failures into a sentence a patient can act on. */
export function friendlyError(status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; error?: unknown };
    const d = parsed.detail ?? parsed.error;
    detail = typeof d === "string" ? d : "";
  } catch {
    detail = "";
  }
  if (status === 413) return "That file is too large. Please upload a file under 10 MB.";
  if (status === 415) return "That file type isn't supported. Upload a PDF, JPG or PNG.";
  if (status === 502 || status === 503 || status === 504)
    return "The reading service is temporarily unavailable. Please try again in a minute.";
  return detail || `Something went wrong (error ${status}). Please try again.`;
}
