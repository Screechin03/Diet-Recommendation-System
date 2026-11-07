import { useState, type ComponentProps, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, Path, Pattern, Rect, Text as SvgText } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { STATUS_COPY, formatDuration, type MetricStatus, type VitalsAnalysis } from "@/lib/vitals";
import { useTheme, type Theme } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];
const SVG_FONT = Platform.OS === "web" ? "system-ui, -apple-system, sans-serif" : undefined;

function toneOf(t: Theme, tone: "green" | "amber" | "red" | "gray") {
  return {
    green: { bg: t.successSoft, fg: t.success },
    amber: { bg: t.warnSoft, fg: t.warn },
    red: { bg: t.dangerSoft, fg: t.danger },
    gray: { bg: t.muted2, fg: t.muted },
  }[tone];
}

function metricTone(t: Theme, s: MetricStatus) {
  return {
    normal: { label: "Normal", ...toneOf(t, "green") },
    attention: { label: "Check", ...toneOf(t, "amber") },
    urgent: { label: "Urgent", ...toneOf(t, "red") },
    unavailable: { label: "No reading", ...toneOf(t, "gray") },
  }[s];
}

function Card({ children, style }: { children: ReactNode; style?: object }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.card, borderColor: t.border }, style]}>{children}</View>;
}

function Metric({ title, value, unit, sub, status }: { title: string; value: string | number; unit?: string; sub: string; status: MetricStatus }) {
  const t = useTheme();
  const tone = metricTone(t, status);
  return (
    <View style={[s.metric, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={s.rowBetween}>
        <Text style={{ color: t.muted, fontSize: 12 }}>{title}</Text>
        <View style={[s.pill, { backgroundColor: tone.bg }]}>
          <Text style={{ color: tone.fg, fontSize: 10.5, fontWeight: "700" }}>{tone.label}</Text>
        </View>
      </View>
      <Text style={{ color: t.text, fontSize: 28, fontWeight: "700", fontVariant: ["tabular-nums"], marginTop: 6 }}>
        {value}
        {unit ? <Text style={{ color: t.muted, fontSize: 13, fontWeight: "400" }}> {unit}</Text> : null}
      </Text>
      <Text style={{ color: t.muted, fontSize: 11.5, marginTop: 2 }} numberOfLines={2}>{sub}</Text>
    </View>
  );
}

export function TrendChart({ points, domain, normal, color, label, unit }: {
  points: [number, number][]; domain: [number, number]; normal?: [number, number]; color: string; label: string; unit: string;
}) {
  const t = useTheme();
  const [W, setW] = useState(0); // measured width: the chart fills phones and tablets alike
  const H = 150, pl = 30, pr = 8, pt = 22, pb = 18;
  const w = W - pl - pr, h = H - pt - pb;
  const [lo, hi] = domain;
  const y = (v: number) => pt + (1 - (Math.min(Math.max(v, lo), hi) - lo) / (hi - lo)) * h;
  const t0 = points[0]?.[0] ?? 0;
  const span = Math.max(1, (points[points.length - 1]?.[0] ?? 1) - t0);
  const x = (tt: number) => pl + ((tt - t0) / span) * w;
  const d = points.map(([tt, v], i) => `${i ? "L" : "M"}${x(tt).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <Card style={{ padding: 10 }}>
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: H }}>
      {W > 0 ? (
      <Svg width={W} height={H} fontFamily={SVG_FONT}>
        <SvgText x={pl} y={13} fontSize={12} fontWeight="700" fill={t.text}>{label}</SvgText>
        {normal ? <Rect x={pl} y={y(normal[1])} width={w} height={y(normal[0]) - y(normal[1])} fill={t.success} fillOpacity={0.1} /> : null}
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <SvgText key={v} x={pl - 5} y={y(v) + 3.5} fontSize={9} fill={t.muted} textAnchor="end">{Math.round(v * 10) / 10}</SvgText>
        ))}
        <Line x1={pl} x2={pl + w} y1={pt + h} y2={pt + h} stroke={t.border} strokeWidth={1} />
        {points.length > 1 ? <Path d={d} stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round" /> : null}
        <SvgText x={pl} y={H - 3} fontSize={9} fill={t.muted}>0:00</SvgText>
        <SvgText x={pl + w} y={H - 3} fontSize={9} fill={t.muted} textAnchor="end">{formatDuration(span)}</SvgText>
      </Svg>
      ) : null}
      </View>
      {normal ? <Text style={{ color: t.muted, fontSize: 11 }}>Shaded: normal {normal[0]}–{normal[1]} {unit}</Text> : null}
    </Card>
  );
}

export function EcgStrip({ mv, hz, peaks }: { mv: number[]; hz: number; peaks: number[] }) {
  if (mv.length < 10 || hz <= 0) return null;
  const pxPerS = 25; // 25 mm/s on standard paper; 1 unit = 1 mm
  const lo = Math.min(...mv), hi = Math.max(...mv);
  const height = Math.max(25, (hi - lo) * 10 + 10);
  const width = (mv.length / hz) * pxPerS;
  const yOf = (v: number) => height - 5 - (v - lo) * 10;
  const d = mv.map((v, i) => `${i ? "L" : "M"}${((i / hz) * pxPerS).toFixed(2)},${yOf(v).toFixed(2)}`).join("");
  const scale = 4; // 4 px per mm on screen
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={{ borderRadius: 12 }}>
      <Svg width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <Pattern id="small" width={1} height={1} patternUnits="userSpaceOnUse">
            <Path d="M1 0H0V1" fill="none" stroke="#fbe2ea" strokeWidth={0.06} />
          </Pattern>
          <Pattern id="big" width={5} height={5} patternUnits="userSpaceOnUse">
            <Rect width={5} height={5} fill="url(#small)" />
            <Path d="M5 0H0V5" fill="none" stroke="#f5b9cb" strokeWidth={0.12} />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill="#ffffff" />
        <Rect width={width} height={height} fill="url(#big)" />
        <Path d={d} stroke="#18181b" strokeWidth={0.22} fill="none" strokeLinejoin="round" />
        {peaks.filter((p) => p >= 0 && p < mv.length).map((p) => (
          <Circle key={p} cx={(p / hz) * pxPerS} cy={yOf(mv[p]) - 2} r={0.6} fill="#e11d48" />
        ))}
      </Svg>
    </ScrollView>
  );
}

export function VitalsResult({ analysis }: { analysis: VitalsAnalysis }) {
  const t = useTheme();
  const copy = STATUS_COPY[analysis.status];
  const tone = toneOf(t, copy.tone);
  const { heart_rate: hr, spo2, temperature: temp, ecg } = analysis.metrics;
  const ecgOk = !!ecg && ecg.status !== "unavailable";
  const sevIcon: Record<string, IconName> = { urgent: "alert-circle", attention: "warning-outline", info: "information-circle-outline" };
  const sevColor: Record<string, string> = { urgent: t.danger, attention: t.warn, info: t.muted };

  return (
    <View style={{ gap: 12 }}>
      <View style={[s.banner, { backgroundColor: tone.bg }]}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <View style={[s.dot, { backgroundColor: tone.fg }]} />
          <Text style={{ color: tone.fg, fontWeight: "800", fontSize: 11, letterSpacing: 1.2 }}>{copy.label.toUpperCase()}</Text>
          {analysis.demo ? (
            <View style={[s.pill, { backgroundColor: t.text }]}>
              <Text style={{ color: t.card, fontSize: 10.5, fontWeight: "700" }}>Sample data</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: "800", marginTop: 6 }}>{analysis.headline}</Text>
        <Text style={{ color: t.muted, marginTop: 4, fontSize: 13 }}>
          {formatDuration(analysis.session.duration_s)} min · {analysis.session.activity === "exercise" ? "after exercise" : "at rest"}
          {analysis.session.pregnancy_month ? ` · month ${analysis.session.pregnancy_month}` : ""}
        </Text>
      </View>

      <View style={s.grid}>
        <Metric title="Heart rate" value={hr?.avg ?? "—"} unit={hr ? "bpm" : undefined} sub={hr ? `${hr.min}–${hr.max} bpm` : "No finger reading"} status={hr?.status ?? "unavailable"} />
        <Metric title="Blood oxygen" value={spo2?.avg ?? "—"} unit={spo2 ? "%" : undefined} sub={spo2 ? `lowest ${spo2.sustained_min}%` : "No finger reading"} status={spo2?.status ?? "unavailable"} />
        <Metric title="Temperature" value={temp?.avg ?? "—"} unit={temp ? "°C" : undefined} sub={temp ? `max ${temp.sustained_max} °C` : "No body sensor"} status={temp?.status ?? "unavailable"} />
        <Metric title="ECG" value={ecgOk ? ecg.heart_rate ?? "—" : "—"} unit={ecgOk ? "bpm" : undefined}
          sub={ecgOk ? `${ecg.rhythm === "irregular" ? "Irregular" : "Regular"} · ${ecg.beats} beats` : ecg ? "Too noisy" : "No ECG"} status={ecg?.status ?? "unavailable"} />
      </View>

      {analysis.findings.length ? (
        <Card>
          <Text style={[s.h, { color: t.text }]}>What we found</Text>
          {analysis.findings.map((f, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <Ionicons name={sevIcon[f.severity] ?? "information-circle-outline"} size={20} color={sevColor[f.severity] ?? t.muted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.text, fontWeight: "700" }}>{f.title}</Text>
                <Text style={{ color: t.muted, lineHeight: 20 }}>{f.detail}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={[s.h, { color: t.text }]}>What to do next</Text>
        {analysis.recommendations.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            <Ionicons name="checkmark-circle-outline" size={19} color={t.success} />
            <Text style={{ color: t.text, flex: 1, lineHeight: 20 }}>{r}</Text>
          </View>
        ))}
      </Card>

      {analysis.series.heart_rate.length ? (
        <TrendChart points={analysis.series.heart_rate} domain={[40, 160]} normal={[60, 100]} color="#e11d48" label="Heart rate" unit="bpm" />
      ) : null}
      {analysis.series.spo2.length ? (
        <TrendChart points={analysis.series.spo2} domain={[85, 100]} normal={[95, 100]} color="#2563eb" label="Blood oxygen" unit="%" />
      ) : null}
      {analysis.series.temperature.length ? (
        <TrendChart points={analysis.series.temperature} domain={[35, 39.5]} normal={[36.1, 37.4]} color="#d97706" label="Temperature" unit="°C" />
      ) : null}

      {analysis.ecg_strip && ecgOk ? (
        <Card>
          <Text style={[s.h, { color: t.text }]}>ECG sample</Text>
          <Text style={{ color: t.muted, fontSize: 12, marginTop: -6 }}>25 mm/s · dots = detected beats · scroll sideways</Text>
          <EcgStrip mv={analysis.ecg_strip.mv} hz={analysis.ecg_strip.hz} peaks={analysis.ecg_strip.peaks} />
          <View style={s.grid}>
            {([
              ["Irregular beats", `${ecg.irregular_beats_pct}%`],
              ["HRV (RMSSD)", `${ecg.rmssd_ms} ms`],
            ] as const).map(([k, v]) => (
              <View key={k} style={[s.stat, { backgroundColor: t.muted2 }]}>
                <Text style={{ color: t.muted, fontSize: 11 }}>{k}</Text>
                <Text style={{ color: t.text, fontWeight: "700" }}>{v}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Text style={{ color: t.muted, fontSize: 11.5, lineHeight: 17 }}>
        Finger detected {analysis.data_quality.finger_detected_pct ?? "—"}% of the time
        {analysis.data_quality.ecg_usable_pct != null ? ` · ECG usable ${analysis.data_quality.ecg_usable_pct}%` : ""}. {analysis.disclaimer}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  banner: { borderRadius: 18, padding: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { borderWidth: 1, borderRadius: 16, padding: 12, width: "48%", flexGrow: 1 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h: { fontSize: 15, fontWeight: "700" },
  stat: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1 },
});
