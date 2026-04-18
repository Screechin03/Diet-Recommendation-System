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

  const url = `${geminiApiBase()}/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { cache: "no-store" });
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

export async function generateContent(
  apiKey: string,
  modelId: string,
  body: unknown,
): Promise<{ ok: true; json: any } | { ok: false; status: number; text: string }>
{
  const url = `${geminiApiBase()}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(
    apiKey,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, text };

  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, status: 502, text };
  }
}
