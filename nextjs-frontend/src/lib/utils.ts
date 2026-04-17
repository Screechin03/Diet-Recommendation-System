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
  const q = encodeURIComponent(`${recipeName},food`);
  return `https://source.unsplash.com/800x600/?${q}`;
}

export async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `Request failed with ${res.status}`);
  }
}
