import { NextResponse } from "next/server";

export const maxDuration = 60;

type ResolvedImage = {
  imageUrl: string | null;
  source: string | null;
  title?: string | null;
};

type GeminiAttemptDebug = {
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
  hasImage?: boolean;
  usedResponseModalities?: string[];
};

type ResolvedImageResponse = ResolvedImage & {
  debug?: {
    geminiKeyPresent: boolean;
    geminiOnlyMode: boolean;
    candidateModels: string[];
    attempts: GeminiAttemptDebug[];
  };
};

type MealDbItem = {
  idMeal?: string;
  strMeal?: string;
  strMealThumb?: string;
  strCategory?: string;
  strArea?: string;
  strTags?: string;
  [key: string]: unknown;
};

type WikimediaPage = {
  title?: string;
  imageinfo?: Array<{ thumburl?: string; url?: string }>;
};

type Candidate = {
  imageUrl: string;
  title: string;
  score: number;
  source: string;
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const resultCache = new Map<string, { expiresAt: number; payload: ResolvedImage }>();

function debugEnabled(url: URL): boolean {
  const fromQuery = (url.searchParams.get("debug") ?? "").trim() === "1";
  const fromEnv = (process.env.RECIPE_IMAGE_DEBUG ?? "").trim().toLowerCase() === "true";
  return fromQuery || fromEnv;
}

function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

function geminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.0-flash-preview-image-generation";
}

function geminiOnlyMode(): boolean {
  return (process.env.GEMINI_IMAGE_REQUIRED ?? "false").trim().toLowerCase() === "true";
}

function geminiCandidateModels(): string[] {
  return unique([
    geminiImageModel(),
    "gemini-2.0-flash-exp-image-generation",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-exp",
  ]);
}

function tokenize(value: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "best",
    "easy",
    "for",
    "free",
    "fresh",
    "healthy",
    "in",
    "of",
    "on",
    "pregnancy",
    "recipe",
    "style",
    "the",
    "with",
  ]);

  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !stopWords.has(t) && !/^\d+$/.test(t));
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function buildQueries(recipeName: string): string[] {
  const cleaned = recipeName.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const tokens = unique(tokenize(cleaned));

  const queries = [
    cleaned,
    tokens.slice(0, 3).join(" "),
    tokens.slice(0, 2).join(" "),
    tokens[0] ?? "",
  ]
    .map((q) => q.trim())
    .filter(Boolean);

  return unique(queries);
}

async function fetchMeals(query: string): Promise<MealDbItem[]> {
  const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { meals?: MealDbItem[] | null };
  return data.meals ?? [];
}

async function fetchMealsByIngredient(ingredient: string): Promise<MealDbItem[]> {
  const url = `https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ingredient)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { meals?: MealDbItem[] | null };
  return (data.meals ?? []).slice(0, 20);
}

async function fetchFromWikimedia(query: string): Promise<WikimediaPage[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php" +
    `?action=query&generator=search&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*&gsrsearch=${encodeURIComponent(query)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as { query?: { pages?: Record<string, WikimediaPage> } };
  const pages = data.query?.pages;
  if (!pages) return [];
  return Object.values(pages);
}

function mealIngredientTokens(meal: MealDbItem): string[] {
  const values: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const key = `strIngredient${i}`;
    const value = meal[key];
    if (typeof value === "string" && value.trim()) values.push(value.trim());
  }
  return tokenize(values.join(" "));
}

function scoreMeal(meal: MealDbItem, recipeTokens: Set<string>, ingredientTokens: Set<string>): number {
  const nameTokens = new Set(tokenize(String(meal.strMeal ?? "")));
  const mealIngTokens = new Set(mealIngredientTokens(meal));
  const metaTokens = new Set(tokenize(`${String(meal.strCategory ?? "")} ${String(meal.strTags ?? "")}`));

  let score = 0;

  for (const token of recipeTokens) {
    if (nameTokens.has(token)) score += 4;
    if (mealIngTokens.has(token)) score += 2;
    if (metaTokens.has(token)) score += 1;
  }

  for (const token of ingredientTokens) {
    if (mealIngTokens.has(token)) score += 3;
    if (nameTokens.has(token)) score += 1;
  }

  return score;
}

function isConfidentMatch(candidate: Candidate, recipeTokens: Set<string>): boolean {
  const titleTokens = new Set(tokenize(candidate.title));
  const titleOverlap = overlapCount(recipeTokens, titleTokens);
  return candidate.score >= 9 && titleOverlap >= 1;
}

function getCached(cacheKey: string): ResolvedImage | null {
  const hit = resultCache.get(cacheKey);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    resultCache.delete(cacheKey);
    return null;
  }
  return hit.payload;
}

function setCached(cacheKey: string, payload: ResolvedImage): void {
  resultCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
}

async function callGeminiImageModel(
  model: string,
  key: string,
  recipeName: string,
  ingredientsRaw: string,
  debugAttempts?: GeminiAttemptDebug[],
): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const prompt = [
    "Generate a photorealistic, high-quality food photograph.",
    `Dish name: ${recipeName}`,
    ingredientsRaw ? `Key ingredients: ${ingredientsRaw}` : "",
    "Single finished dish plated for serving.",
    "Top-down or 45-degree plate shot with natural lighting.",
    "No people, no hands, no packaging, no labels, no text, no logos, no watermarks.",
    "No collage, no multiple dishes, no utensils in focus.",
  ]
    .filter(Boolean)
    .join("\n");

  const reqBodies: Array<{ body: unknown; responseModalities: string[] }> = [
    {
      responseModalities: ["IMAGE"],
      body: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          temperature: 0.4,
        },
      },
    },
    {
      responseModalities: ["IMAGE", "TEXT"],
      body: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 0.4,
        },
      },
    },
  ];

  let lastStatus: number | undefined;
  let lastError: string | undefined;
  let lastOk = false;
  let lastHasImage = false;
  let lastModalities: string[] | undefined;

  for (const attempt of reqBodies) {
    lastModalities = attempt.responseModalities;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(attempt.body),
      cache: "no-store",
    });

    lastStatus = res.status;
    lastOk = res.ok;

    if (!res.ok) {
      const text = await res.text();
      lastError = text.slice(0, 1200);
      continue;
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: {
              mimeType?: string;
              data?: string;
            };
            inline_data?: {
              mimeType?: string;
              data?: string;
            };
          }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const camel = part.inlineData;
      const snake = part.inline_data;
      const mime = camel?.mimeType ?? snake?.mimeType;
      const b64 = camel?.data ?? snake?.data;

      if (mime?.startsWith("image/") && b64) {
        lastHasImage = true;
        return `data:${mime};base64,${b64}`;
      }
    }

    // Sometimes the API returns 200 with no inline image.
    lastError = lastError ?? "OK response but no inline image data returned.";
  }

  if (debugAttempts) {
    debugAttempts.push({
      model,
      ok: lastOk,
      status: lastStatus,
      error: lastError,
      hasImage: lastHasImage,
      usedResponseModalities: lastModalities,
    });
  }

  return null;
}

async function fetchFromGemini(
  recipeName: string,
  ingredientsRaw: string,
  debugAttempts?: GeminiAttemptDebug[],
): Promise<{ imageUrl: string | null; model: string | null }> {
  const key = geminiApiKey();
  if (!key) return { imageUrl: null, model: null };

  for (const model of geminiCandidateModels()) {
    const imageUrl = await callGeminiImageModel(model, key, recipeName, ingredientsRaw, debugAttempts);
    if (imageUrl) return { imageUrl, model };
  }

  return { imageUrl: null, model: null };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const recipeName = (url.searchParams.get("name") ?? "").trim();
    const ingredientsRaw = (url.searchParams.get("ingredients") ?? "").trim();
    const wantDebug = debugEnabled(url);
    const geminiAttempts: GeminiAttemptDebug[] = [];

    if (!recipeName) {
      return NextResponse.json({ imageUrl: null, source: null });
    }

    const cacheKey = `v3::${recipeName}||${ingredientsRaw}`;
    const cached = wantDebug ? null : getCached(cacheKey);
    if (cached) return NextResponse.json(cached);

    const gemini = await fetchFromGemini(recipeName, ingredientsRaw, wantDebug ? geminiAttempts : undefined);
    if (gemini.imageUrl) {
      const payload: ResolvedImageResponse = {
        imageUrl: gemini.imageUrl,
        source: `gemini-generated:${gemini.model ?? "unknown"}`,
        title: recipeName,
      };
      if (wantDebug) {
        payload.debug = {
          geminiKeyPresent: Boolean(geminiApiKey()),
          geminiOnlyMode: geminiOnlyMode(),
          candidateModels: geminiCandidateModels(),
          attempts: geminiAttempts,
        };
      } else {
        setCached(cacheKey, payload);
      }
      return NextResponse.json(payload);
    }

    if (geminiOnlyMode()) {
      const payload: ResolvedImageResponse = { imageUrl: null, source: "gemini-unavailable", title: recipeName };
      if (wantDebug) {
        payload.debug = {
          geminiKeyPresent: Boolean(geminiApiKey()),
          geminiOnlyMode: geminiOnlyMode(),
          candidateModels: geminiCandidateModels(),
          attempts: geminiAttempts,
        };
      } else {
        setCached(cacheKey, payload);
      }
      return NextResponse.json(payload);
    }

    const recipeTokens = new Set(tokenize(recipeName));
    const ingredientTokenList = unique(tokenize(ingredientsRaw));
    const ingredientTokens = new Set(ingredientTokenList);

    const queries = buildQueries(recipeName);
    const candidates: Candidate[] = [];

    for (const query of queries) {
      const meals = await fetchMeals(query);

      for (const meal of meals) {
        const imageUrl = typeof meal.strMealThumb === "string" ? meal.strMealThumb : "";
        if (!imageUrl) continue;

        const score = scoreMeal(meal, recipeTokens, ingredientTokens);
        candidates.push({
          score,
          imageUrl,
          title: String(meal.strMeal ?? ""),
          source: "themealdb-name",
        });
      }
    }

    for (const ingredient of ingredientTokenList.slice(0, 3)) {
      const meals = await fetchMealsByIngredient(ingredient);
      for (const meal of meals) {
        const imageUrl = typeof meal.strMealThumb === "string" ? meal.strMealThumb : "";
        const title = String(meal.strMeal ?? "");
        if (!imageUrl || !title) continue;

        const titleTokens = new Set(tokenize(title));
        const score = overlapCount(recipeTokens, titleTokens) * 6 + (ingredientTokens.has(ingredient) ? 3 : 0);

        candidates.push({
          score,
          imageUrl,
          title,
          source: "themealdb-ingredient",
        });
      }
    }

    const deduped = unique(candidates.map((c) => `${c.imageUrl}|${c.title}`))
      .map((key) => candidates.find((c) => `${c.imageUrl}|${c.title}` === key))
      .filter((c): c is Candidate => Boolean(c));

    deduped.sort((a, b) => b.score - a.score);
    const best = deduped[0] ?? null;

    if (best && isConfidentMatch(best, recipeTokens)) {
      const payload: ResolvedImage = {
        imageUrl: best.imageUrl,
        source: best.source,
        title: best.title,
      };
      setCached(cacheKey, payload);
      return NextResponse.json(payload);
    }

    // Strict fallback: only accept Wikimedia image titles that overlap recipe tokens.
    const wikiQuery = `${recipeName} dish food`;
    const pages = await fetchFromWikimedia(wikiQuery);
    let wikiBest: Candidate | null = null;

    for (const page of pages) {
      const title = String(page.title ?? "");
      const imageUrl = page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url ?? "";
      if (!title || !imageUrl) continue;

      const titleTokens = new Set(tokenize(title));
      const score = overlapCount(recipeTokens, titleTokens) * 5 + overlapCount(ingredientTokens, titleTokens) * 3;

      if (!wikiBest || score > wikiBest.score) {
        wikiBest = {
          imageUrl,
          title,
          score,
          source: "wikimedia",
        };
      }
    }

    if (wikiBest && wikiBest.score >= 6) {
      const payload: ResolvedImage = {
        imageUrl: wikiBest.imageUrl,
        source: wikiBest.source,
        title: wikiBest.title,
      };
      setCached(cacheKey, payload);
      return NextResponse.json(payload);
    }

    const payload: ResolvedImageResponse = { imageUrl: null, source: null, title: null };
    if (wantDebug) {
      payload.debug = {
        geminiKeyPresent: Boolean(geminiApiKey()),
        geminiOnlyMode: geminiOnlyMode(),
        candidateModels: geminiCandidateModels(),
        attempts: geminiAttempts,
      };
    } else {
      setCached(cacheKey, payload);
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ imageUrl: null, source: null });
  }
}
