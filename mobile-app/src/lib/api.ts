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
  PrescriptionReport,
  RefinedSummary,
  RiskPredictionOut,
} from "./types";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
  if (!res.ok) throw new Error(errorMessageFrom(text, res.status));
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

/** Next.js /api/prescription_report → FastAPI POST /prescription_report (multipart, Gemini OCR). */
export function prescriptionReport(
  file: PickedFile,
  opts: { dietaryPreferences: string; allergies: string; goals: string; includeDietPlan: boolean },
): Promise<PrescriptionReport> {
  const form = new FormData();
  // React Native's FormData accepts {uri,name,type} file descriptors.
  form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  form.append("dietary_preferences", opts.dietaryPreferences);
  form.append("allergies", opts.allergies);
  form.append("goals", opts.goals);
  form.append("include_diet_plan", String(opts.includeDietPlan));
  // Do not set content-type: fetch adds the multipart boundary itself.
  return request<PrescriptionReport>("/api/prescription_report", { method: "POST", body: form });
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
