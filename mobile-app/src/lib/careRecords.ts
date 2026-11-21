// Turns each tool's result into a record the patient can keep and share with her doctor.
// Same shapes as the website (nextjs-frontend/src/lib/careRecords.ts), so records open on both.

import type { NewRecord, Severity } from "./care";
import { humanizeDocType, normalizeReport, type PrescriptionApiResponse } from "./report";
import type { HealthAnalyticsInput, PregnancyInfo, PredictionOut, Recipe, RiskPredictionOut } from "./types";
import type { VitalsAnalysis } from "./vitals";

export interface RefinedSummary {
  title?: string;
  summary?: string;
  bullets?: string[];
}

export interface ReportRecordData {
  extracted: Record<string, unknown> | null;
  diet_plan: Record<string, unknown> | null;
  ocr: { quality: string; message: string; text: string; avg_confidence: number; engine: string } | null;
  file: PrescriptionApiResponse["file"] | null;
}

export interface RiskRecordData {
  input: HealthAnalyticsInput;
  result: RiskPredictionOut;
  refined: RefinedSummary | null;
}

export interface DietPlanRecordData {
  pregnancy_info: PregnancyInfo;
  ingredients: string[];
  recipes: Recipe[];
  meta: PredictionOut["meta"] | null;
  refined: RefinedSummary | null;
  doctor_instructions: { avoid: string[]; include: string[]; restrictions: string[]; note: string | null; by: string | null } | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function probabilityToPercent(probability: unknown): number | null {
  const p = typeof probability === "number" ? probability : Number(probability);
  if (probability == null || !Number.isFinite(p)) return null;
  if (p <= 1) return Math.max(0, Math.min(100, Math.round(p * 100)));
  return Math.max(0, Math.min(100, Math.round(p)));
}

export function reportRecord(resp: PrescriptionApiResponse): NewRecord {
  const report = normalizeReport(resp.extracted);
  const flagged = report?.tests.filter((t) => t.flag && t.flag !== "normal").length ?? 0;
  const parts = [
    report?.medications.length ? plural(report.medications.length, "medicine") : null,
    report?.tests.length ? plural(report.tests.length, "test result") : null,
    flagged ? `${flagged} flagged` : null,
    report?.document.date ? report.document.date : null,
    report?.document.provider ?? null,
  ].filter(Boolean);
  const ocr = resp.ocr
    ? { quality: resp.ocr.quality, message: resp.ocr.message, text: resp.ocr.text, avg_confidence: resp.ocr.avg_confidence, engine: resp.ocr.engine }
    : null;
  const data: ReportRecordData = { extracted: resp.extracted ?? null, diet_plan: resp.diet_plan ?? null, ocr, file: resp.file ?? null };
  return {
    kind: "report",
    title: report?.document.type ? humanizeDocType(report.document.type) : "Medical document",
    summary: parts.join(" · ") || (ocr?.text ? "Handwriting scan" : null),
    severity: flagged || report?.uncertainties.length ? "attention" : "normal",
    data: data as unknown as Record<string, unknown>,
  };
}

const VITALS_SEVERITY: Record<VitalsAnalysis["status"], Severity> = {
  normal: "normal",
  attention: "attention",
  urgent: "urgent",
  insufficient: "info",
};

export function vitalsRecord(a: VitalsAnalysis): NewRecord {
  return {
    kind: "vitals",
    title: a.demo ? "Vital signs (sample data)" : "Vital signs",
    summary: a.headline,
    severity: VITALS_SEVERITY[a.status] ?? "info",
    data: a as unknown as Record<string, unknown>,
    is_sample: a.demo,
  };
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, normal: 1, attention: 2, urgent: 3 };

/**
 * Severity of a risk check for the doctor's triage: the model's level, raised by red-flag readings so a
 * dangerous value is never filed as "normal" (severe-range blood pressure in pregnancy is >= 160/110).
 */
export function riskSeverity(level: string | undefined, input?: Partial<HealthAnalyticsInput>): Severity {
  const l = (level ?? "").toLowerCase();
  const model: Severity = l.includes("high") ? "urgent" : l.includes("medium") || l.includes("moderate") ? "attention" : l.includes("low") ? "normal" : "info";
  const sys = Number(input?.systolic_bp ?? 0);
  const dia = Number(input?.diastolic_bp ?? 0);
  const sugar = Number(input?.blood_sugar ?? 0);
  const tempF = Number(input?.body_temp ?? 0);
  const readings: Severity =
    sys >= 160 || dia >= 110
      ? "urgent"
      : sys >= 140 || dia >= 90 || sugar >= 11.1 || tempF >= 100.4
        ? "attention"
        : "info";
  return SEVERITY_RANK[readings] > SEVERITY_RANK[model] ? readings : model;
}

export function riskRecord(input: HealthAnalyticsInput, result: RiskPredictionOut, refined: RefinedSummary | null): NewRecord {
  const level = String(result.risk_assessment?.risk_level ?? "Unknown");
  const pct = probabilityToPercent(result.risk_assessment?.risk_probability);
  const parts = [
    `${level} risk${pct != null ? ` (${pct}%)` : ""}`,
    input.systolic_bp && input.diastolic_bp ? `BP ${input.systolic_bp}/${input.diastolic_bp}` : null,
    input.blood_sugar ? `sugar ${input.blood_sugar} mmol/L` : null,
  ].filter(Boolean);
  const data: RiskRecordData = { input, result, refined };
  return {
    kind: "risk",
    title: "Pregnancy risk check",
    summary: parts.join(" · "),
    severity: riskSeverity(level, input),
    data: data as unknown as Record<string, unknown>,
  };
}

export function dietPlanRecord(data: DietPlanRecordData): NewRecord {
  const info = data.pregnancy_info;
  const extras = [
    ...(info.dietary_restrictions ?? []),
    info.has_gestational_diabetes ? "gestational diabetes" : null,
    info.has_anemia ? "anaemia" : null,
  ].filter(Boolean);
  return {
    kind: "diet_plan",
    title: `Diet plan · month ${info.pregnancy_month}`,
    summary: [plural(data.recipes.length, "recipe"), ...extras].join(" · "),
    severity: "info",
    data: data as unknown as Record<string, unknown>,
  };
}
