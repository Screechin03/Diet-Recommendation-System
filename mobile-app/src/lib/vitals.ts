// Shared with nextjs-frontend/src/lib/vitals.ts (keep the two in sync).
// Vitals device (ESP32: MAX30102 + AD8232): live-line parsing and analysis types.
// Protocol: Docs/DEVICE_PROTOCOL.md. The backend re-parses everything for analysis; this file only drives the
// live display, so it mirrors the backend's validation ranges.

export type HelloMsg = { t: "hello"; device?: string; fw?: string; ecg_hz?: number; adc_bits?: number };
export type VitalsMsg = { t: "vitals"; ms: number; hr: number | null; spo2: number | null; temp_c: number | null; finger: boolean };
export type EcgMsg = { t: "ecg"; ms: number; lo: boolean; s: number[] };
export type DeviceMsg = HelloMsg | VitalsMsg | EcgMsg | { t: "end"; ms?: number };

const inRange = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;

/** Parses one protocol line. Returns null for anything that isn't a valid v1 message (debug prints, partial lines). */
export function parseDeviceLine(line: string): DeviceMsg | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return null;
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    o = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (o.t) {
    case "hello":
      return {
        t: "hello",
        device: typeof o.device === "string" ? o.device : undefined,
        fw: typeof o.fw === "string" ? o.fw : undefined,
        ecg_hz: inRange(o.ecg_hz, 125, 1000) ?? undefined,
        adc_bits: inRange(o.adc_bits, 8, 24) ?? undefined,
      };
    case "vitals": {
      const ms = inRange(o.ms, 0, Number.MAX_SAFE_INTEGER);
      if (ms === null) return null;
      const finger = o.finger !== false;
      return {
        t: "vitals",
        ms,
        finger,
        hr: finger ? inRange(o.hr, 30, 220) : null,
        spo2: finger ? inRange(o.spo2, 70, 100) : null,
        temp_c: inRange(o.temp_c, 30, 43),
      };
    }
    case "ecg": {
      const ms = inRange(o.ms, 0, Number.MAX_SAFE_INTEGER);
      if (ms === null || !Array.isArray(o.s) || !o.s.length) return null;
      return { t: "ecg", ms, lo: o.lo === true, s: o.s.map((v) => (typeof v === "number" ? v : NaN)) };
    }
    case "end":
      return { t: "end" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Analysis response (FastAPI vitals/analysis.py)
// ---------------------------------------------------------------------------

export type VitalsStatus = "normal" | "attention" | "urgent" | "insufficient";
export type MetricStatus = "normal" | "attention" | "urgent" | "unavailable";
export type Severity = "info" | "attention" | "urgent";

export interface VitalsFinding {
  severity: Severity;
  title: string;
  detail: string;
  metric: string;
}

export interface HeartRateMetric { avg: number; min: number; max: number; sustained_max: number; unit: string; normal_range: string; status: MetricStatus }
export interface Spo2Metric { avg: number; min: number; sustained_min: number; time_below_95_pct: number; unit: string; normal_range: string; status: MetricStatus }
export interface TempMetric { avg: number; max: number; sustained_max: number; unit: string; normal_range: string; status: MetricStatus }
export interface EcgMetric {
  status: MetricStatus;
  heart_rate?: number;
  rr_mean_ms?: number;
  sdnn_ms?: number;
  rmssd_ms?: number;
  irregular_beats_pct?: number;
  beats?: number;
  usable_pct?: number;
  rhythm?: "regular" | "irregular";
  rhythm_status?: MetricStatus;
  rate_status?: MetricStatus;
}

export interface VitalsAnalysis {
  analysis_version: string;
  analyzed_at: string;
  status: VitalsStatus;
  headline: string;
  demo: boolean;
  session: { duration_s: number; device: { device?: string; fw?: string }; ecg_hz: number; activity: "rest" | "exercise"; pregnancy_month: number | null };
  metrics: { heart_rate: HeartRateMetric | null; spo2: Spo2Metric | null; temperature: TempMetric | null; ecg: EcgMetric | null };
  findings: VitalsFinding[];
  recommendations: string[];
  data_quality: {
    lines_total: number;
    lines_skipped: number;
    values_rejected: number;
    finger_detected_pct: number | null;
    ecg_usable_pct: number | null;
    truncated: boolean;
    device_restarts?: number;
  };
  series: { heart_rate: [number, number][]; spo2: [number, number][]; temperature: [number, number][] };
  ecg_strip: { hz: number; start_s: number; mv: number[]; peaks: number[]; unit: string } | null;
  disclaimer: string;
}

export const STATUS_COPY: Record<VitalsStatus, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  normal: { label: "Normal", tone: "green" },
  attention: { label: "Needs attention", tone: "amber" },
  urgent: { label: "Urgent", tone: "red" },
  insufficient: { label: "Incomplete", tone: "gray" },
};

export const MIN_RECORDING_S = 60;
export const MAX_RECORDING_S = 30 * 60;

export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
