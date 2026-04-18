export function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function recipeImageUrl(recipeName: string): string {
  // Unsplash's "source" endpoint often rate-limits (503) in some networks.
  // Use a stable, unauthenticated fallback provider by default.
  // You can switch providers via NEXT_PUBLIC_IMAGE_PROVIDER.
  const provider = (process.env.NEXT_PUBLIC_IMAGE_PROVIDER ?? "loremflickr").toLowerCase();

  const seed = stableHash(recipeName);

  if (provider === "unsplash") {
    const q = encodeURIComponent(`${recipeName},food`);
    return `https://source.unsplash.com/800x600/?${q}`;
  }

  if (provider === "picsum") {
    return `https://picsum.photos/seed/${seed}/800/600`;
  }

  // loremflickr: more food-focused, supports a stable lock.
  return `https://loremflickr.com/800/600/food?lock=${seed}`;
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
