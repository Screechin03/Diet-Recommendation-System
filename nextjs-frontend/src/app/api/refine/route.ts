import { NextResponse } from "next/server";
import { generateContent, listGenerateContentModels } from "../_gemini";

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
  return process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
}

function geminiCandidateModels(): string[] {
  const envModel = (process.env.GEMINI_MODEL ?? "").trim();
  const candidates = [
    envModel,
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-2.0-pro",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
  ].filter(Boolean);
  return [...new Set(candidates)];
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
  const discovered = await listGenerateContentModels(key);
  const models = [...new Set([...geminiCandidateModels(), ...discovered])];

  let lastError = "";
  let lastStatus = 0;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 512,
    },
  };

  for (const model of models) {
    const result = await generateContent(key, model, body);
    if (!result.ok) {
      lastStatus = result.status;
      lastError = result.text;
      continue;
    }

    const data = result.json;
    const candidateText: string | undefined =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("\n") ??
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      lastStatus = 502;
      lastError = "Gemini returned no text";
      continue;
    }

    const cleaned = candidateText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const maybeJson = cleaned.slice(start, end + 1);
        try {
          return JSON.parse(maybeJson);
        } catch {
          // fall through
        }
      }

      return { title: "Refined", summary: cleaned, bullets: [] };
    }
  }

  throw new Error(`Gemini error ${lastStatus}: ${String(lastError).slice(0, 1200)}`);
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
