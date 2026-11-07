import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Body,
  Bullets,
  Button,
  Card,
  Chips,
  Col,
  Disclaimer,
  ErrorBox,
  H2,
  NumberField,
  Row,
  Screen,
  SectionLabel,
  ToggleRow,
} from "@/components/ui";
import { Refined } from "@/components/Refined";
import { useTheme } from "@/components/theme";
import { predictRisk, refine } from "@/lib/api";
import type { HealthAnalyticsInput, RefinedSummary, RiskPredictionOut, RiskRecommendations } from "@/lib/types";

const LEVELS3 = [
  { value: "low" as const, label: "Low" },
  { value: "moderate" as const, label: "Moderate" },
  { value: "high" as const, label: "High" },
];
const ALCOHOL = [
  { value: "none" as const, label: "None" },
  { value: "occasional" as const, label: "Occasional" },
  { value: "regular" as const, label: "Regular" },
];

function defaultHealth(): HealthAnalyticsInput {
  return {
    age: 28,
    systolic_bp: 120,
    diastolic_bp: 80,
    blood_sugar: 7.0,
    body_temp: 98.6,
    bmi: 22.0,
    heart_rate: 75,
    previous_complications: false,
    preexisting_diabetes: false,
    gestational_diabetes: false,
    mental_health_issues: false,
    smoking_history: false,
    alcohol_consumption: "none",
    exercise_frequency: "moderate",
    sleep_hours: 8,
    stress_level: "low",
  };
}

function MetricBar({ label, value, unit, min, max, normal }: {
  label: string; value: number; unit?: string; min: number; max: number; normal: [number, number];
}) {
  const t = useTheme();
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%` as const;
  const ok = value >= normal[0] && value <= normal[1];
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: t.text }}>{label}</Text>
        <Text style={{ color: ok ? t.success : t.warn, fontWeight: "600" }}>
          {value} {unit ?? ""} {ok ? "· normal" : "· check"}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border }}>
        <View
          style={{
            position: "absolute",
            left: pct(normal[0]),
            width: `${((normal[1] - normal[0]) / (max - min)) * 100}%`,
            height: 8,
            backgroundColor: t.successSoft,
            borderRadius: 4,
          }}
        />
        <View
          style={{
            position: "absolute",
            left: pct(value),
            marginLeft: -6,
            top: -2,
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: ok ? t.success : t.warn,
          }}
        />
      </View>
    </View>
  );
}

export default function HealthScreen() {
  const t = useTheme();
  const [h, setH] = useState<HealthAnalyticsInput>(defaultHealth);
  const [useAi, setUseAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskPredictionOut | null>(null);
  const [refined, setRefined] = useState<RefinedSummary | null>(null);

  const update = (patch: Partial<HealthAnalyticsInput>) => setH((cur) => ({ ...cur, ...patch }));

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    setRefined(null);
    try {
      const data = await predictRisk(h);
      setResult(data);
      if (useAi) setRefined(await refine("risk", { health_data: h, risk_response: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const risk = result?.risk_assessment;
  const high = String(risk?.risk_level ?? "").toLowerCase() === "high";
  const recs = (result?.recommendations ?? null) as RiskRecommendations | null;

  return (
    <Screen>
      <Pressable
        onPress={() => router.push("/vitals")}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          borderRadius: 16,
          backgroundColor: t.primarySoft,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="hardware-chip-outline" size={22} color={t.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "700" }}>Have the MamaCare device?</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>Analyse its heart rate, oxygen and ECG readings</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.muted} />
      </Pressable>
      <Card>
        <SectionLabel>Vitals</SectionLabel>
        <Row>
          <Col><NumberField label="Age" value={h.age} onChange={(age) => update({ age })} /></Col>
          <Col><NumberField label="BMI" value={h.bmi} onChange={(bmi) => update({ bmi })} decimal /></Col>
        </Row>
        <Row>
          <Col><NumberField label="Systolic BP" unit="mmHg" value={h.systolic_bp} onChange={(systolic_bp) => update({ systolic_bp })} /></Col>
          <Col><NumberField label="Diastolic BP" unit="mmHg" value={h.diastolic_bp} onChange={(diastolic_bp) => update({ diastolic_bp })} /></Col>
        </Row>
        <Row>
          <Col><NumberField label="Blood sugar" unit="mmol/L" value={h.blood_sugar} onChange={(blood_sugar) => update({ blood_sugar })} decimal /></Col>
          <Col><NumberField label="Heart rate" unit="bpm" value={h.heart_rate} onChange={(heart_rate) => update({ heart_rate })} /></Col>
        </Row>
        <Row>
          <Col><NumberField label="Body temp" unit="°F" value={h.body_temp} onChange={(body_temp) => update({ body_temp })} decimal /></Col>
          <Col><NumberField label="Sleep" unit="hours" value={h.sleep_hours} onChange={(sleep_hours) => update({ sleep_hours })} /></Col>
        </Row>
      </Card>

      <Card>
        <SectionLabel>Medical history</SectionLabel>
        <ToggleRow label="Previous pregnancy complications" value={!!h.previous_complications} onChange={(v) => update({ previous_complications: v })} />
        <ToggleRow label="Pre-existing diabetes" value={!!h.preexisting_diabetes} onChange={(v) => update({ preexisting_diabetes: v })} />
        <ToggleRow label="Gestational diabetes" value={!!h.gestational_diabetes} onChange={(v) => update({ gestational_diabetes: v })} />
        <ToggleRow label="Mental health concerns" value={!!h.mental_health_issues} onChange={(v) => update({ mental_health_issues: v })} />
        <ToggleRow label="Smoking history" value={!!h.smoking_history} onChange={(v) => update({ smoking_history: v })} />
      </Card>

      <Card>
        <SectionLabel>Lifestyle</SectionLabel>
        <Body>Alcohol</Body>
        <Chips options={ALCOHOL} selected={[h.alcohol_consumption ?? "none"]} onToggle={(v) => update({ alcohol_consumption: v })} />
        <Body>Exercise</Body>
        <Chips options={LEVELS3} selected={[h.exercise_frequency ?? "moderate"]} onToggle={(v) => update({ exercise_frequency: v })} />
        <Body>Stress</Body>
        <Chips options={LEVELS3} selected={[h.stress_level ?? "low"]} onToggle={(v) => update({ stress_level: v })} />
        <ToggleRow label="AI summary" hint="Explain the result in plain language" value={useAi} onChange={setUseAi} />
      </Card>

      <Button title="Check my risk" onPress={submit} loading={loading} />
      <ErrorBox message={error} />

      {risk ? (
        <Card style={{ borderColor: high ? t.danger : t.success, borderWidth: 2 }}>
          <Text style={{ color: high ? t.danger : t.success, fontSize: 24, fontWeight: "800" }}>
            {String(risk.risk_level ?? "Unknown")} risk
          </Text>
          <Body muted>
            {typeof risk.risk_probability === "number" ? `High-risk probability ${Math.round(risk.risk_probability * 100)}%` : ""}
            {typeof risk.confidence === "number" ? ` · model confidence ${Math.round(risk.confidence * 100)}%` : ""}
          </Body>
          {risk.risk_factors?.length ? (
            <>
              <H2>Risk factors</H2>
              <Bullets items={risk.risk_factors} color={t.warn} />
            </>
          ) : null}
        </Card>
      ) : null}

      <Refined refined={refined} />

      {result ? (
        <Card>
          <H2>Your vitals</H2>
          <MetricBar label="BMI" value={h.bmi ?? 22} min={15} max={45} normal={[18.5, 24.9]} />
          <MetricBar label="Blood sugar" value={h.blood_sugar ?? 7} unit="mmol/L" min={3} max={14} normal={[4, 7.8]} />
          <MetricBar label="Systolic BP" value={h.systolic_bp ?? 120} unit="mmHg" min={80} max={200} normal={[90, 120]} />
          <MetricBar label="Diastolic BP" value={h.diastolic_bp ?? 80} unit="mmHg" min={40} max={130} normal={[60, 80]} />
          <MetricBar label="Heart rate" value={h.heart_rate ?? 75} unit="bpm" min={40} max={160} normal={[60, 100]} />
          <MetricBar label="Body temp" value={h.body_temp ?? 98.6} unit="°F" min={95} max={104} normal={[97, 99.5]} />
        </Card>
      ) : null}

      {recs ? (
        <Card>
          {([
            ["Do now", recs.immediate_actions],
            ["Lifestyle changes", recs.lifestyle_changes],
            ["Monitoring", recs.monitoring_requirements],
            ["Talk to your doctor about", recs.medical_consultations],
          ] as const).map(([title, items]) =>
            items?.length ? (
              <View key={title} style={{ gap: 6 }}>
                <H2>{title}</H2>
                <Bullets items={items} />
              </View>
            ) : null,
          )}
        </Card>
      ) : null}

      <Disclaimer />
    </Screen>
  );
}
