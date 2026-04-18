export function parseCsvList(value: string): string[] {
  return value
    .split(/[\n,]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function recipeImageCandidates(recipeName: string, ingredients: string[] = []): string[] {
  // Build a query from recipe name + ingredients so images are near-exact.
  const provider = (process.env.NEXT_PUBLIC_IMAGE_PROVIDER ?? "loremflickr").toLowerCase();
  const seed = stableHash(recipeName);
  const titleTokens = tokenizeForImage(recipeName).slice(0, 4);
  const ingredientTokens = tokenizeForImage(ingredients.join(" ")).slice(0, 4);
  const mergedTokens = uniqueStrings([...titleTokens, ...ingredientTokens]).slice(0, 6);

  const strictQuery = [
    ...titleTokens.slice(0, 3),
    ...ingredientTokens.slice(0, 2),
    "dish",
    "food",
  ].join(" ");
  const broadQuery = [...mergedTokens.slice(0, 4), "food"].join(" ");
  const tags = uniqueStrings(["food", ...mergedTokens]).slice(0, 6).join(",");

  const unsplashStrict = `https://source.unsplash.com/800x600/?${encodeURIComponent(strictQuery)}`;
  const unsplashBroad = `https://source.unsplash.com/800x600/?${encodeURIComponent(broadQuery)}`;
  const loremflickrTagged = `https://loremflickr.com/800/600/${tags}?lock=${seed}`;
  const loremflickrFood = `https://loremflickr.com/800/600/food?lock=${seed}`;
  const picsumFallback = `https://picsum.photos/seed/${seed}/800/600`;

  if (provider === "unsplash") {
    return uniqueStrings([
      unsplashStrict,
      unsplashBroad,
      loremflickrTagged,
      loremflickrFood,
      picsumFallback,
    ]);
  }

  if (provider === "picsum") {
    return uniqueStrings([
      loremflickrTagged,
      unsplashStrict,
      unsplashBroad,
      loremflickrFood,
      picsumFallback,
    ]);
  }

  // Default provider: food-focused + semantic fallback.
  return uniqueStrings([
    loremflickrTagged,
    unsplashStrict,
    unsplashBroad,
    loremflickrFood,
    picsumFallback,
  ]);
}

export function recipeImageUrl(recipeName: string, ingredients: string[] = []): string {
  return recipeImageCandidates(recipeName, ingredients)[0] ?? "/recipe-placeholder.svg";
}

function tokenizeForImage(value: string): string[] {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "best",
    "easy",
    "for",
    "fresh",
    "healthy",
    "homemade",
    "in",
    "of",
    "on",
    "pregnancy",
    "quick",
    "recipe",
    "style",
    "the",
    "with",
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 2 && !stopWords.has(v) && !/^\d+$/.test(v));
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }

  return out;
}

function stableHash(input: string): number {
  // Deterministic, fast hash -> positive 32-bit int.
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

export async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `Request failed with ${res.status}`);
  }
}
