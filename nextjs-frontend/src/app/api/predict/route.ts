import { NextResponse } from "next/server";
import { apiBaseUrl, jsonError } from "../_proxy";
import { generateContent, listGenerateContentModels } from "../_gemini";

export const maxDuration = 60;

type PredictionIn = {
  pregnancy_info: unknown;
  ingredients: string[];
  params?: unknown;
};

type Recipe = {
  Name?: string;
  RecipeIngredientParts?: string[];
  [key: string]: unknown;
};

type PredictionOut = {
  output: Recipe[] | null;
  meta?: {
    ingredients_used?: string[];
    ingredient_corrections?: Array<{ from: string; to: string; reason?: string }>;
    gemini_used?: boolean;
    dietary_restrictions_applied?: string[];
    substitutions?: Array<{ from: string; to: string; reason?: string }>;
  };
};

function normalizeIngredientsInput(ingredients: unknown): string[] {
  const list = Array.isArray(ingredients) ? ingredients : [];
  return list
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeRestrictions(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((v) => (typeof v === "string" ? canonicalizeRestriction(v) : ""))
    .filter(Boolean)
    .slice(0, 20);
}

function canonicalizeRestriction(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  const collapsed = raw.replace(/[_\s]+/g, " ").trim();
  const map: Record<string, string> = {
    "plant based": "vegan",
    "plant-based": "vegan",
    "vegan": "vegan",
    "vegetarian": "vegetarian",
    "gluten free": "gluten-free",
    "gluten-free": "gluten-free",
    "dairy free": "dairy-free",
    "dairy-free": "dairy-free",
    "lactose free": "dairy-free",
    "lactose-free": "dairy-free",
    "egg free": "egg-free",
    "egg-free": "egg-free",
    "nut free": "nut-free",
    "nut-free": "nut-free",
    "soy free": "soy-free",
    "soy-free": "soy-free",
  };
  return map[collapsed] ?? collapsed.replace(/\s+/g, "-");
}

function getDietaryRestrictions(pregnancyInfo: unknown): string[] {
  if (!pregnancyInfo || typeof pregnancyInfo !== "object") return [];
  const restrictions = (pregnancyInfo as any).dietary_restrictions;
  return normalizeRestrictions(restrictions);
}

function isVegan(restrictions: string[]): boolean {
  return restrictions.some((r) => r === "vegan");
}

const MEAT_AND_SEAFOOD_TERMS = [
  // meats / seafood
  "chicken",
  "beef",
  "pork",
  "lamb",
  "turkey",
  "bacon",
  "ham",
  "fish",
  "salmon",
  "tuna",
  "shrimp",
  "prawn",
  "anchovy",
  "crab",
  "lobster",
  "oyster",
  "mussel",
  "clam",
  "sardine",
  "mackerel",
  "steak",
  "pepperoni",
  "sausage",
  "prosciutto",
  "gelatin",
];

const EGG_TERMS = ["egg", "eggs", "mayonnaise", "mayo"];

const DAIRY_TERMS = [
  // eggs
  // dairy
  "milk",
  "cheese",
  "butter",
  "ghee",
  "paneer",
  "yogurt",
  "curd",
  "cream",
  "whey",
  "dairy",
  "casein",
  "lactose",
  "cottage cheese",
  "ricotta",
  "mozzarella",
  "parmesan",
  "feta",
  "gouda",
  "cheddar",
  "buttermilk",
  "sour cream",
];

const OTHER_ANIMAL_TERMS = ["honey"];

const GLUTEN_TERMS = [
  "wheat",
  "barley",
  "rye",
  "wheat flour",
  "all-purpose flour",
  "all purpose flour",
  "maida",
  "bread",
  "pasta",
  "ramen",
  "udon",
  "wheat noodles",
  "semolina",
  "couscous",
  "bulgur",
  "breadcrumbs",
  "cracker",
  "crackers",
  "soy sauce",
  "seitan",
];

const NUT_TERMS = [
  "peanut",
  "peanuts",
  "almond",
  "almonds",
  "walnut",
  "walnuts",
  "cashew",
  "cashews",
  "pistachio",
  "pistachios",
  "pecan",
  "pecans",
  "hazelnut",
  "hazelnuts",
  "macadamia",
  "brazil nut",
  "mixed nuts",
  "nut butter",
];

const SOY_TERMS = [
  "soy",
  "soya",
  "tofu",
  "tempeh",
  "edamame",
  "miso",
  "tamari",
  "soy sauce",
];

const RESTRICTION_FORBIDDEN: Record<string, string[]> = {
  vegan: [...MEAT_AND_SEAFOOD_TERMS, ...EGG_TERMS, ...DAIRY_TERMS, ...OTHER_ANIMAL_TERMS],
  vegetarian: [...MEAT_AND_SEAFOOD_TERMS],
  "gluten-free": [...GLUTEN_TERMS],
  "dairy-free": [...DAIRY_TERMS],
  "egg-free": [...EGG_TERMS],
  "nut-free": [...NUT_TERMS],
  "soy-free": [...SOY_TERMS],
};

function restrictionKeys(restrictions: string[]): string[] {
  return restrictions.map((r) => canonicalizeRestriction(r)).filter(Boolean);
}

function forbiddenTermsForRestrictions(restrictions: string[]): string[] {
  const keys = restrictionKeys(restrictions);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const terms = RESTRICTION_FORBIDDEN[k];
    if (!terms) continue;
    for (const t of terms) {
      const term = t.toLowerCase().trim();
      if (!term || seen.has(term)) continue;
      seen.add(term);
      out.push(term);
    }
  }
  return out;
}

function textHasAnyTerm(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  for (const t of terms) {
    const term = t.toLowerCase().trim();
    if (!term) continue;
    if (term.includes(" ")) {
      if (lower.includes(term)) return true;
      continue;
    }
    const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    if (re.test(lower)) return true;
  }
  return false;
}

function violatesAnyRestriction(recipe: Recipe, restrictions: string[]): boolean {
  const parts = Array.isArray(recipe.RecipeIngredientParts) ? recipe.RecipeIngredientParts : [];
  const haystack = `${String(recipe.Name ?? "")} ${parts.join(" ")}`;
  const forbidden = forbiddenTermsForRestrictions(restrictions);
  if (!forbidden.length) return false;
  return textHasAnyTerm(haystack, forbidden);
}

function applyDietaryFilters(output: Recipe[] | null, restrictions: string[]): Recipe[] | null {
  if (!output) return output;
  if (!restrictions.length) return output;
  return output.filter((r) => !violatesAnyRestriction(r, restrictions));
}

function restrictionSubstituteFallback(
  ingredients: string[],
  restrictions: string[],
): {
  normalized: string[];
  substitutions: Array<{ from: string; to: string; reason?: string }>;
} {
  const substitutions: Array<{ from: string; to: string; reason?: string }> = [];
  const keys = restrictionKeys(restrictions);
  const vegan = keys.includes("vegan");
  const vegetarian = keys.includes("vegetarian");
  const glutenFree = keys.includes("gluten-free");
  const dairyFree = keys.includes("dairy-free");
  const eggFree = keys.includes("egg-free");
  const nutFree = keys.includes("nut-free");
  const soyFree = keys.includes("soy-free");

  const proteinAlt = () => {
    // Choose a plant protein that avoids soy if needed.
    if (soyFree) return "chickpeas";
    return "tofu";
  };

  const mapOne = (ing: string): string[] => {
    const v = ing.toLowerCase().trim();
    if (!v) return [];

    // Vegan / Vegetarian protein swaps
    if ((vegan || vegetarian) && textHasAnyTerm(v, MEAT_AND_SEAFOOD_TERMS)) {
      substitutions.push({ from: ing, to: "lentils", reason: vegan ? "vegan substitute" : "vegetarian substitute" });
      return ["lentils"];
    }

    // Dairy-free / Vegan dairy swaps
    if ((vegan || dairyFree) && textHasAnyTerm(v, DAIRY_TERMS)) {
      const target = v === "milk" || v.includes("cream") ? "coconut milk" : proteinAlt();
      substitutions.push({ from: ing, to: target, reason: vegan ? "vegan substitute" : "dairy-free substitute" });
      return [target];
    }

    // Egg-free / Vegan egg swaps
    if ((vegan || eggFree) && textHasAnyTerm(v, EGG_TERMS)) {
      substitutions.push({ from: ing, to: "chickpea flour", reason: vegan ? "vegan substitute" : "egg-free substitute" });
      return ["chickpea flour"];
    }

    // Soy-free swaps
    if (soyFree && textHasAnyTerm(v, SOY_TERMS)) {
      const target = v.includes("sauce") ? "coconut aminos" : "chickpeas";
      substitutions.push({ from: ing, to: target, reason: "soy-free substitute" });
      return [target];
    }

    // Gluten-free swaps
    if (glutenFree && textHasAnyTerm(v, GLUTEN_TERMS)) {
      const target = v.includes("pasta") || v.includes("noodle") || v.includes("ramen") || v.includes("udon") ? "rice noodles" : "rice";
      substitutions.push({ from: ing, to: target, reason: "gluten-free substitute" });
      return [target];
    }

    // Nut-free swaps
    if (nutFree && textHasAnyTerm(v, NUT_TERMS)) {
      substitutions.push({ from: ing, to: "sunflower seeds", reason: "nut-free substitute" });
      return ["sunflower seeds"];
    }

    return [ing];
  };

  const normalized = ingredients.flatMap(mapOne).map((s) => s.toLowerCase());
  return { normalized: Array.from(new Set(normalized)).slice(0, 8), substitutions };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ingredientMatchScore(recipe: Recipe, ingredients: string[]): number {
  const parts = Array.isArray(recipe.RecipeIngredientParts) ? recipe.RecipeIngredientParts : [];
  const haystack = `${String(recipe.Name ?? "")} ${parts.join(" ")}`.toLowerCase();
  let score = 0;

  for (const ingRaw of ingredients) {
    const ing = ingRaw.toLowerCase().trim();
    if (!ing) continue;

    // Word-boundary match for single tokens; substring match for multi-word.
    if (ing.includes(" ")) {
      if (haystack.includes(ing)) score += 2;
      continue;
    }

    const re = new RegExp(`\\b${escapeRegex(ing)}\\b`, "i");
    if (re.test(haystack)) score += 2;
  }

  return score;
}

function recipeMatchesIngredient(recipe: Recipe, ingredient: string): boolean {
  const parts = Array.isArray(recipe.RecipeIngredientParts) ? recipe.RecipeIngredientParts : [];
  const haystack = `${String(recipe.Name ?? "")} ${parts.join(" ")}`.toLowerCase();
  const ing = ingredient.toLowerCase().trim();
  if (!ing) return false;

  if (ing.includes(" ")) return haystack.includes(ing);
  const re = new RegExp(`\\b${escapeRegex(ing)}\\b`, "i");
  return re.test(haystack);
}

function ingredientsCoverage(output: Recipe[] | null, ingredients: string[]): Map<string, boolean> {
  const covered = new Map<string, boolean>();
  for (const ing of ingredients) covered.set(ing, false);
  if (!output || !ingredients.length) return covered;

  for (const recipe of output) {
    for (const ing of ingredients) {
      if (covered.get(ing)) continue;
      if (recipeMatchesIngredient(recipe, ing)) covered.set(ing, true);
    }
  }

  return covered;
}

function filterRequireAny(output: Recipe[] | null, requiredIngredients: string[]): Recipe[] | null {
  if (!output) return output;
  const required = requiredIngredients.map((s) => s.trim()).filter(Boolean);
  if (!required.length) return output;
  return output.filter((r) => required.some((ing) => recipeMatchesIngredient(r, ing)));
}

function rerankAndFilter(output: Recipe[] | null, ingredients: string[]): Recipe[] | null {
  if (!output) return output;
  if (!ingredients.length) return output;

  const scored = output
    .map((r, idx) => ({ r, idx, score: ingredientMatchScore(r, ingredients) }))
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

  const anyMatches = scored.some((s) => s.score > 0);
  if (!anyMatches) return [];

  // Keep only recipes with a real match to avoid showing irrelevant results.
  return scored.filter((s) => s.score > 0).map((s) => s.r);
}

function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

function geminiModel(): string {
  return (
    process.env.GEMINI_INGREDIENT_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-2.0-flash"
  );
}

function geminiCandidateModels(): string[] {
  const envModel = geminiModel();
  const candidates = [
    envModel,
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-2.0-pro",
    "gemini-1.5-flash-latest",
  ].filter(Boolean);
  return [...new Set(candidates)];
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function callGeminiNormalizeIngredients(ingredients: string[], restrictions: string[]) {
  const key = geminiApiKey();
  if (!key) return null;

  const discovered = await listGenerateContentModels(key);
  const models = [...new Set([...geminiCandidateModels(), ...discovered])];

  const keys = restrictionKeys(restrictions);
  const restrictionLine = keys.length
    ? `IMPORTANT: Dietary restrictions: ${keys.join(", ")}. Do NOT include ingredients that violate these restrictions. If the user provided a conflicting ingredient, substitute it with a compliant alternative.`
    : "";

  const substitutionExamples = keys.length
    ? [
        "When substituting due to restrictions, pick COMMON ingredient keywords likely to appear in recipes.",
        "Examples:",
        "- vegan: paneer/cheese -> tofu or chickpeas; milk/cream -> coconut milk",
        "- vegetarian: chicken/fish -> lentils or beans",
        "- gluten-free: pasta/bread/wheat -> rice noodles, rice, quinoa",
        "- dairy-free: milk/cheese/paneer/ghee -> coconut milk or chickpeas",
        "- egg-free: egg/mayo -> chickpea flour",
        "- nut-free: almonds/peanuts -> sunflower seeds",
        "- soy-free: tofu/soy sauce -> chickpeas or coconut aminos",
      ].join("\n")
    : "";
  const prompt = [
    "You normalize ingredient keywords for a recipe search.",
    "Fix typos (example: 'panner' -> 'paneer').",
    "Expand obvious synonyms when helpful (example: 'chickpeas' -> 'garbanzo beans'), but keep the list short.",
    restrictionLine,
    substitutionExamples,
    "Return ONLY valid JSON with keys: normalized, corrections, substitutions.",
    "- normalized: array of 1-8 lowercase ingredient keywords (no brand names, no extra text)",
    "- corrections: array of objects {from,to,reason}",
    "- substitutions: array of objects {from,to,reason}",
    "Never include markdown, code fences, or commentary.",
    "INPUT:",
    JSON.stringify({ ingredients, dietary_restrictions: restrictions }),
  ]
    .filter(Boolean)
    .join("\n");


  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
  };

  for (const model of models) {
    const result = await generateContent(key, model, body);
    if (!result.ok) continue;

    const data: any = result.json;

    const candidateText: string | undefined =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n") ??
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) continue;
    const cleaned = stripCodeFences(String(candidateText));

    try {
      const parsed = JSON.parse(cleaned) as {
        normalized?: unknown;
        corrections?: unknown;
        substitutions?: unknown;
      };

      const normalized = normalizeIngredientsInput(parsed.normalized).map((s) => s.toLowerCase());
      const correctionsRaw = Array.isArray(parsed.corrections) ? parsed.corrections : [];
      const corrections = correctionsRaw
        .map((c) => ({
          from: typeof c?.from === "string" ? c.from : "",
          to: typeof c?.to === "string" ? c.to : "",
          reason: typeof c?.reason === "string" ? c.reason : undefined,
        }))
        .filter((c) => c.from && c.to)
        .slice(0, 12);

      const substitutionsRaw = Array.isArray(parsed.substitutions) ? parsed.substitutions : [];
      const substitutions = substitutionsRaw
        .map((c) => ({
          from: typeof c?.from === "string" ? c.from : "",
          to: typeof c?.to === "string" ? c.to : "",
          reason: typeof c?.reason === "string" ? c.reason : undefined,
        }))
        .filter((c) => c.from && c.to)
        .slice(0, 12);

      if (!normalized.length) continue;
      return { normalized, corrections, substitutions };
    } catch {
      continue;
    }
  }

  return null;
}

async function callBackendPredict(body: PredictionIn): Promise<Response> {
  const targetUrl = `${apiBaseUrl()}/predict/`;
  return await fetch(targetUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

function toBackendDietaryRestrictions(restrictions: string[]): string[] {
  const keys = restrictionKeys(restrictions);
  const map: Record<string, string> = {
    vegan: "Vegan",
    vegetarian: "Vegetarian",
    "gluten-free": "Gluten-free",
    "dairy-free": "Dairy-free",
    "egg-free": "Egg-free",
    "nut-free": "Nut-free",
    "soy-free": "Soy-free",
  };
  const out: string[] = [];
  for (const k of keys) {
    const label = map[k] ?? "";
    if (!label) continue;
    if (out.includes(label)) continue;
    out.push(label);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const incoming = (await req.json()) as PredictionIn;
    const ingredientsOriginal = normalizeIngredientsInput(incoming?.ingredients);
    const restrictions = getDietaryRestrictions((incoming as any)?.pregnancy_info);

    const forbidden = forbiddenTermsForRestrictions(restrictions);
    const inputConflictsRestriction =
      forbidden.length > 0 && ingredientsOriginal.some((ing) => textHasAnyTerm(ing, forbidden));

    const pregnancyInfoForBackend =
      incoming?.pregnancy_info && typeof incoming.pregnancy_info === "object"
        ? {
            ...(incoming.pregnancy_info as any),
            dietary_restrictions: toBackendDietaryRestrictions(restrictions),
          }
        : incoming?.pregnancy_info;

    const outgoingBase: PredictionIn = {
      ...incoming,
      pregnancy_info: pregnancyInfoForBackend,
    };

    // 1) Try backend with the raw ingredients.
    const res1 = await callBackendPredict({
      ...outgoingBase,
      ingredients: ingredientsOriginal,
    });

    const text1 = await res1.text();
    if (!res1.ok) {
      return new NextResponse(text1, { status: res1.status, headers: { "content-type": "application/json" } });
    }

    let parsed1: PredictionOut;
    try {
      parsed1 = JSON.parse(text1) as PredictionOut;
    } catch {
      return jsonError("Backend returned invalid JSON", 502);
    }

    const filtered1Ranked = rerankAndFilter(parsed1.output ?? null, ingredientsOriginal);
    const filtered1 = applyDietaryFilters(filtered1Ranked, restrictions);
    const hasUsefulMatches = Array.isArray(filtered1) ? filtered1.length > 0 : false;
    const coverage1 = ingredientsCoverage(parsed1.output ?? null, ingredientsOriginal);
    const missingIngredients = ingredientsOriginal.filter((ing) => !coverage1.get(ing));
    const shouldTryGemini =
      Boolean(geminiApiKey()) &&
      ingredientsOriginal.length > 0 &&
      (missingIngredients.length > 0 || inputConflictsRestriction);

    if ((!shouldTryGemini && hasUsefulMatches) || !ingredientsOriginal.length) {
      return NextResponse.json({
        ...parsed1,
        output: filtered1,
        meta: {
          ...(parsed1.meta ?? {}),
          ingredients_used: ingredientsOriginal,
          gemini_used: false,
          dietary_restrictions_applied: restrictions,
        },
      } satisfies PredictionOut);
    }

    // 2) If nothing matches, automatically use Gemini to correct ingredients and retry.
    // 2) If nothing matches OR restriction conflicts, normalize (typos + vegan-safe substitutions) and retry.
    const normalized = await callGeminiNormalizeIngredients(ingredientsOriginal, restrictions);
    const normalizedFallback = !normalized && restrictions.length
      ? restrictionSubstituteFallback(ingredientsOriginal, restrictions)
      : null;

    if (!normalized && !normalizedFallback) {
      return NextResponse.json({
        ...parsed1,
        output: [],
        meta: {
          ...(parsed1.meta ?? {}),
          ingredients_used: ingredientsOriginal,
          gemini_used: false,
          dietary_restrictions_applied: restrictions,
        },
      } satisfies PredictionOut);
    }

    const ingredientsFixed = (normalized?.normalized ?? normalizedFallback?.normalized ?? []).slice(0, 8);
    const substitutions = normalized?.substitutions ?? normalizedFallback?.substitutions ?? [];
    const res2 = await callBackendPredict({
      ...outgoingBase,
      ingredients: ingredientsFixed,
    });

    const text2 = await res2.text();
    if (!res2.ok) {
      // If Gemini succeeded but backend failed, fall back to empty instead of irrelevant results.
      return NextResponse.json({
        output: [],
        meta: {
          ingredients_used: ingredientsFixed,
          ingredient_corrections: normalized?.corrections ?? [],
          gemini_used: Boolean(normalized),
        },
      } satisfies PredictionOut);
    }

    let parsed2: PredictionOut;
    try {
      parsed2 = JSON.parse(text2) as PredictionOut;
    } catch {
      return jsonError("Backend returned invalid JSON", 502);
    }

    const filtered2BaseRanked = rerankAndFilter(parsed2.output ?? null, ingredientsFixed);
    const filtered2Base = applyDietaryFilters(filtered2BaseRanked, restrictions);
    const correctedTargets = (normalized?.corrections ?? []).map((c) => c.to).filter(Boolean);
    const requiredTargets = substitutions.length ? substitutions.map((s) => s.to).filter(Boolean) : correctedTargets;
    const filtered2 = requiredTargets.length ? filterRequireAny(filtered2Base, requiredTargets) : filtered2Base;

    return NextResponse.json({
      ...parsed2,
      output: filtered2,
      meta: {
        ...(parsed2.meta ?? {}),
        ingredients_used: ingredientsFixed,
        ingredient_corrections: normalized?.corrections ?? [],
        substitutions,
        gemini_used: Boolean(normalized),
        dietary_restrictions_applied: restrictions,
      },
    } satisfies PredictionOut);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Failed to reach backend: ${msg}`, 502);
  }
}
