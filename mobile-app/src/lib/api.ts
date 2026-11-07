/**
 * API client for the mobile app.
 *
 * The app talks to the SAME Next.js `/api/*` routes the website uses. Those routes:
 *   - proxy to the FastAPI ML backend (recipes, risk model, prescription reader)
 *   - keep GEMINI_API_KEY on the server (never shipped inside the app)
 *   - add Gemini ingredient correction + dietary post-filtering (/api/predict)
 *
 * So the only thing the app needs is EXPO_PUBLIC_API_URL = the deployed web app URL.
 */
import type {
  HealthAnalyticsInput,
  PickedFile,
  PredictionIn,
  PredictionOut,
  RefinedSummary,
  RiskPredictionOut,
} from "./types";
import { friendlyError, type HandwritingApiResponse, type PrescriptionApiResponse } from "./report";
import type { VitalsAnalysis } from "./vitals";

const REQUEST_TIMEOUT_MS = 60_000;

export function apiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!raw) {
    throw new Error("EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and set it.");
  }
  return raw.replace(/\/+$/, "");
}

/** Turn FastAPI `{detail}` / Next.js `{error}` / plain-text bodies into a readable message. */
function errorMessageFrom(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    const msg = parsed.detail ?? parsed.error;
    if (typeof msg === "string" && msg) return msg;
    if (msg) return JSON.stringify(msg);
  } catch {
    // not JSON
  }
  return text.trim().slice(0, 300) || `Request failed (${status})`;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error("The server took too long to respond. Please try again.");
    throw new Error(`Could not reach the server. Check your internet connection. (${e instanceof Error ? e.message : e})`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      /prescription|ocr|vitals/.test(path) ? friendlyError(res.status, text) : errorMessageFrom(text, res.status),
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Server returned an invalid response.");
  }
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Next.js /api/predict → FastAPI POST /predict/ (KNN recipe recommender). */
export function predictRecipes(body: PredictionIn): Promise<PredictionOut> {
  return postJson<PredictionOut>("/api/predict", body);
}

/** Next.js /api/refine → Gemini plain-language summary of recipes or risk results. */
export async function refine(kind: "recipes" | "risk", payload: unknown): Promise<RefinedSummary | null> {
  try {
    const res = await postJson<{ refined?: RefinedSummary }>("/api/refine", { kind, payload });
    return res.refined ?? null;
  } catch {
    return null; // AI summary is optional; never block the main result on it.
  }
}

/** Next.js /api/predict_pregnancy_risk → FastAPI POST /predict_pregnancy_risk (RandomForest). */
export function predictRisk(health: HealthAnalyticsInput): Promise<RiskPredictionOut> {
  return postJson<RiskPredictionOut>("/api/predict_pregnancy_risk", { health_data: health });
}

function uploadForm(file: PickedFile): FormData {
  const form = new FormData();
  // React Native's FormData accepts {uri,name,type} file descriptors.
  form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return form;
}

/**
 * Next.js /api/prescription_report → FastAPI POST /prescription_report:
 * block-letter handwriting scan + Gemini extraction + diet plan. Can take up to ~2 minutes.
 */
export function prescriptionReport(
  file: PickedFile,
  opts: { dietaryPreferences: string; allergies: string; goals: string; includeDietPlan: boolean },
): Promise<PrescriptionApiResponse> {
  const form = uploadForm(file);
  form.append("dietary_preferences", opts.dietaryPreferences);
  form.append("allergies", opts.allergies);
  form.append("goals", opts.goals);
  form.append("include_diet_plan", String(opts.includeDietPlan));
  // Do not set content-type: fetch adds the multipart boundary itself.
  return request<PrescriptionApiResponse>("/api/prescription_report", { method: "POST", body: form }, 120_000);
}

/** Next.js /api/ocr_handwriting → FastAPI POST /ocr/handwriting (h_recog block-letter model, no AI key needed). */
export function scanHandwriting(file: PickedFile): Promise<HandwritingApiResponse> {
  return request<HandwritingApiResponse>("/api/ocr_handwriting", { method: "POST", body: uploadForm(file) }, 45_000);
}

// ---------------------------------------------------------------------------
// Vitals device (protocol: Docs/DEVICE_PROTOCOL.md). Phones read the SD-card file; live USB is on the website.
// ---------------------------------------------------------------------------

/** SD-card session file → /api/vitals/analyze_file. */
export function analyzeVitalsFile(
  file: PickedFile,
  opts: { pregnancyMonth: number | null; activity: "rest" | "exercise" },
): Promise<VitalsAnalysis> {
  const form = uploadForm(file);
  if (opts.pregnancyMonth) form.append("pregnancy_month", String(opts.pregnancyMonth));
  form.append("activity", opts.activity);
  return request<VitalsAnalysis>("/api/vitals/analyze_file", { method: "POST", body: form }, 60_000);
}

/** Simulated session (sample data) → analysis, for trying the feature without the device. */
export async function analyzeVitalsDemo(
  scenario: string,
  opts: { pregnancyMonth: number | null; activity: "rest" | "exercise" },
): Promise<VitalsAnalysis> {
  const demo = await request<{ lines: string[] }>(`/api/vitals/demo?scenario=${encodeURIComponent(scenario)}&seconds=120`);
  return postJson<VitalsAnalysis>("/api/vitals/analyze", {
    lines: demo.lines,
    pregnancy_month: opts.pregnancyMonth,
    activity: opts.activity,
  });
}

/** PDF report bytes for an analysis (/api/vitals/report). */
export async function vitalsReportPdf(analysis: VitalsAnalysis, patient: { name?: string | null; pregnancy_month?: number | null }): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${apiBaseUrl()}/api/vitals/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysis, patient }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(friendlyError(res.status, await res.text()));
    return await res.arrayBuffer();
  } catch (e) {
    if (controller.signal.aborted) throw new Error("Creating the report took too long. Please try again.");
    if (e instanceof Error && e.message && !(e instanceof TypeError)) throw e;
    throw new Error("Could not reach the server. Check your internet connection.");
  } finally {
    clearTimeout(timer);
  }
}

/** Next.js /api/recipe_image → resolves a matching photo URL (TheMealDB/Wikimedia/Gemini). */
export async function recipeImage(name: string, ingredients: string[]): Promise<string | null> {
  try {
    const qs = `name=${encodeURIComponent(name)}&ingredients=${encodeURIComponent(ingredients.join(","))}`;
    const res = await request<{ imageUrl?: string | null }>(`/api/recipe_image?${qs}`);
    return res.imageUrl ?? null;
  } catch {
    return null;
  }
}

export function parseCsvList(value: string): string[] {
  return value
    .split(/[\n,]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}
