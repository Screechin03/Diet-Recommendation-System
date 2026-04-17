import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RefineKind = "recipes" | "risk";

type RefineRequest = {
  kind: RefineKind;
  payload: unknown;
};

function geminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return key;
}

function geminiModel(): string {
  return process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
}

function buildPrompt(kind: RefineKind, payload: unknown): string {
  const baseRules = [
    "You are refining output for a pregnancy nutrition and health app.",
    "Do NOT invent facts, do NOT change numeric values, and do NOT add new diagnoses.",
    "Only rewrite/summarize/explain the provided data in clearer language.",
    "If user safety is relevant, add a short disclaimer: consult a clinician.",
    "Return JSON ONLY with keys: title, summary, bullets.",
    "- title: short string",
    "- summary: 2-4 sentences",
    "- bullets: 4-8 short bullet strings",
  ].join("\n");

  if (kind === "recipes") {
    return [
      baseRules,
      "\nTASK:",
      "Given the recipe recommendations and pregnancy profile, write a friendly explanation and highlight why the recipes fit.",
      "Mention dietary restrictions and any pregnancy benefits already present.",
      "\nINPUT JSON:",
      JSON.stringify(payload),
    ].join("\n");
  }

  return [
    baseRules,
    "\nTASK:",
    "Given the risk assessment output and input health metrics, explain what it means in plain language.",
    "Do not give emergency instructions; instead give cautious next steps and what to discuss with a clinician.",
    "\nINPUT JSON:",
    JSON.stringify(payload),
  ].join("\n");
}

async function callGemini(prompt: string) {
  const key = geminiApiKey();
  const model = geminiModel();

  // Generative Language API (Gemini). Model names can vary by account; expose GEMINI_MODEL.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 512,
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Unexpected Gemini response: ${text.slice(0, 500)}`);
  }

  const candidateText: string | undefined =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n") ??
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!candidateText) {
    throw new Error("Gemini returned no text");
  }

  // Gemini may wrap JSON in code fences; strip if present.
  const cleaned = candidateText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: return as plain text
    return { title: "Refined", summary: cleaned, bullets: [] };
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RefineRequest;
    if (!body?.kind) {
      return NextResponse.json({ error: "Missing kind" }, { status: 400 });
    }

    if (body.kind !== "recipes" && body.kind !== "risk") {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }

    const prompt = buildPrompt(body.kind, body.payload);
    const refined = await callGemini(prompt);

    return NextResponse.json({ refined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
