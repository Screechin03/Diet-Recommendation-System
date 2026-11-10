export type GeminiPart = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

export type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
};

/** Concatenated text of the first candidate, or undefined. */
export function candidateText(json: GeminiResponse | null | undefined): string | undefined {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p?.text)
    .filter((t): t is string => Boolean(t))
    .join("\n");
  return text || undefined;
}

/** Auth header for the Gemini REST API. The key must never go in the URL (proxies and logs record URLs). */
export function geminiHeaders(apiKey: string): Record<string, string> {
  return { "content-type": "application/json", "x-goog-api-key": apiKey };
}

type ModelListResponse = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};

function geminiApiBase(): string {
  return "https://generativelanguage.googleapis.com/v1beta";
}

function stripModelsPrefix(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("models/")) return trimmed.slice("models/".length);
  return trimmed;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function looksLikeTextModel(id: string): boolean {
  const v = id.toLowerCase();
  if (!v.includes("gemini")) return false;
  if (v.includes("embedding")) return false;
  if (v.includes("aqa")) return false;
  // Some accounts expose image-only / special-purpose models; we still allow them
  // as long as they support generateContent, but prefer plain text/flash.
  return true;
}

function sortPreferred(ids: string[]): string[] {
  const preferences = [
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-pro",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
  ];

  const score = (id: string): number => {
    const lower = id.toLowerCase();
    const idx = preferences.findIndex((p) => lower === p);
    if (idx >= 0) return 1000 - idx;
    if (lower.includes("flash")) return 500;
    if (lower.includes("pro")) return 400;
    return 100;
  };

  return [...ids].sort((a, b) => score(b) - score(a));
}

let cached: { expiresAt: number; generateContentModels: string[] } | null = null;
const CACHE_TTL_MS = 1000 * 60 * 10;

export async function listGenerateContentModels(apiKey: string): Promise<string[]> {
  if (cached && Date.now() < cached.expiresAt) return cached.generateContentModels;

  const res = await fetch(`${geminiApiBase()}/models`, { headers: geminiHeaders(apiKey), cache: "no-store" });
  if (!res.ok) {
    cached = { expiresAt: Date.now() + 30_000, generateContentModels: [] };
    return [];
  }

  const data = (await res.json()) as ModelListResponse;
  const ids = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => stripModelsPrefix(String(m.name ?? "")))
    .filter((id) => id && looksLikeTextModel(id));

  const models = sortPreferred(uniqueStrings(ids));
  cached = { expiresAt: Date.now() + CACHE_TTL_MS, generateContentModels: models };
  return models;
}

type GenerateResult = { ok: true; json: GeminiResponse } | { ok: false; status: number; text: string };

type GenerateContentBody = {
  contents?: Array<{ parts?: GeminiPart[] }>;
  generationConfig?: { temperature?: number; maxOutputTokens?: number; responseMimeType?: string };
};

type InteractionResponse = {
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
};

// Newer keys (`AQ.` format, new Google accounts) get 404 on every generateContent model, while the
// Interactions API (POST /v1beta/interactions) works. Fastest model first; override with GEMINI_INTERACTIONS_MODEL.
const INTERACTIONS_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
const INTERACTIONS_TIMEOUT_MS = 45_000;
let useInteractions = false;
let workingInteractionsModel: string | null = null;

function toInteractionsInput(body: GenerateContentBody): Array<Record<string, string>> {
  const parts = (body.contents ?? []).flatMap((c) => c.parts ?? []);
  const out: Array<Record<string, string>> = [];
  for (const p of parts) {
    if (p.text) {
      out.push({ type: "text", text: p.text });
      continue;
    }
    const mime = p.inlineData?.mimeType ?? p.inline_data?.mime_type;
    const data = p.inlineData?.data ?? p.inline_data?.data;
    if (mime && data) out.push({ type: mime.startsWith("image/") ? "image" : "document", mime_type: mime, data });
  }
  return out;
}

async function generateViaInteractions(apiKey: string, body: GenerateContentBody): Promise<GenerateResult> {
  const cfg = body.generationConfig ?? {};
  const request: Record<string, unknown> = {
    input: toInteractionsInput(body),
    store: false, // don't keep user health data on Google's side
    generation_config: {
      // Hidden "thinking" tokens count against max_output_tokens and cut JSON answers off mid-way.
      thinking_level: "minimal",
      ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
      ...(cfg.maxOutputTokens !== undefined ? { max_output_tokens: cfg.maxOutputTokens } : {}),
    },
  };
  if (cfg.responseMimeType === "application/json") {
    request.response_format = { type: "text", mime_type: "application/json" };
  }

  const models = uniqueStrings(
    [workingInteractionsModel ?? "", process.env.GEMINI_INTERACTIONS_MODEL ?? "", ...INTERACTIONS_MODELS],
  );
  let last: GenerateResult = { ok: false, status: 404, text: "No Interactions model available" };
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(`${geminiApiBase()}/interactions`, {
        method: "POST",
        headers: geminiHeaders(apiKey),
        body: JSON.stringify({ ...request, model }),
        cache: "no-store",
        signal: AbortSignal.timeout(INTERACTIONS_TIMEOUT_MS),
      });
    } catch (e) {
      last = { ok: false, status: 504, text: e instanceof Error ? e.message : String(e) };
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      last = { ok: false, status: res.status, text };
      if (res.status === 401 || res.status === 403) return last; // bad key: other models won't help
      continue;
    }
    try {
      const json = JSON.parse(text) as InteractionResponse;
      const out = (json.steps ?? [])
        .filter((s) => s.type === "model_output")
        .flatMap((s) => s.content ?? [])
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text as string)
        .join("\n")
        .trim();
      if (!out) {
        last = { ok: false, status: 502, text: "Gemini returned no text" };
        continue;
      }
      workingInteractionsModel = model;
      // Same shape as generateContent, so callers (candidateText) need no changes.
      return { ok: true, json: { candidates: [{ content: { parts: [{ text: out }] } }] } };
    } catch {
      last = { ok: false, status: 502, text };
    }
  }
  return last;
}

export async function generateContent(apiKey: string, modelId: string, body: unknown): Promise<GenerateResult> {
  if (useInteractions) return generateViaInteractions(apiKey, body as GenerateContentBody);

  const url = `${geminiApiBase()}/models/${encodeURIComponent(modelId)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: geminiHeaders(apiKey),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  if (res.status === 404) {
    // Retired model, or generateContent closed for this key: try the Interactions API.
    const viaInteractions = await generateViaInteractions(apiKey, body as GenerateContentBody);
    if (viaInteractions.ok) {
      useInteractions = true;
      return viaInteractions;
    }
  }
  if (!res.ok) return { ok: false, status: res.status, text };

  try {
    return { ok: true, json: JSON.parse(text) as GeminiResponse };
  } catch {
    return { ok: false, status: 502, text };
  }
}
