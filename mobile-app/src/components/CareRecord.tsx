// Saved records (report, vitals, risk check, diet plan), the doctor's review form, the patient's review
// panel and the diet-instructions editor. Same data as the website's components/care.
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "./theme";
import { Body, Bullets, Button, Card, H2, InfoBox, SectionLabel } from "./ui";
import { Pill, Thread, toneColors, type Tone } from "./Care";
import { DietPlanCard, ReportCard } from "./ReportViews";
import { VitalsResult } from "./VitalsViews";
import { RecipeCard } from "./RecipeCard";
import { Refined } from "./Refined";
import {
  careErrorMessage,
  doctorName,
  fileUrl,
  formatDateTime,
  requestReview,
  sendMessage,
  setDietInstructions,
  timeAgo,
  VERDICT_COPY,
  type CareLink,
  type DietInstructions,
  type HealthRecord,
  type Verdict,
} from "@/lib/care";
import { probabilityToPercent, type DietPlanRecordData, type ReportRecordData, type RiskRecordData } from "@/lib/careRecords";
import { formatBytes, isEmptyReport, normalizeDietPlan, normalizeReport } from "@/lib/report";
import type { VitalsAnalysis } from "@/lib/vitals";

export function RecordContent({ record }: { record: HealthRecord }) {
  switch (record.kind) {
    case "report":
      return <ReportRecord record={record} />;
    case "vitals": {
      const v = record.data as unknown as VitalsAnalysis;
      return v?.metrics && v?.session ? <VitalsResult analysis={v} /> : <InfoBox>This record can't be displayed.</InfoBox>;
    }
    case "risk":
      return <RiskRecord data={record.data as unknown as RiskRecordData} />;
    case "diet_plan":
      return <DietPlanRecord data={record.data as unknown as DietPlanRecordData} />;
    default:
      return <InfoBox>This record can't be displayed.</InfoBox>;
  }
}

function ReportRecord({ record }: { record: HealthRecord }) {
  const t = useTheme();
  const data = record.data as unknown as Partial<ReportRecordData>;
  const report = normalizeReport(data.extracted);
  const plan = normalizeDietPlan(data.diet_plan);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openOriginal() {
    if (!record.file_path) return;
    setOpening(true);
    setError(null);
    try {
      await Linking.openURL(await fileUrl(record.file_path));
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't open the document."));
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      {record.file_path ? (
        <Pressable onPress={openOriginal} accessibilityRole="button" style={[s.fileRow, { backgroundColor: t.card, borderColor: t.border }]}>
          <Ionicons name="document-outline" size={24} color={t.muted} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: "700" }}>{record.file_name ?? "Original document"}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>Original upload{record.file_size ? ` · ${formatBytes(record.file_size)}` : ""}</Text>
          </View>
          {opening ? <ActivityIndicator color={t.primary} /> : <Ionicons name="open-outline" size={20} color={t.primary} />}
        </Pressable>
      ) : null}
      {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
      {!isEmptyReport(report) && report ? <ReportCard report={report} /> : null}
      {plan ? <DietPlanCard plan={plan} /> : null}
      {data.ocr?.text ? (
        <Card>
          <SectionLabel>Handwriting scan</SectionLabel>
          <Text style={{ color: t.text, fontFamily: "Courier", fontSize: 14 }}>{data.ocr.text}</Text>
        </Card>
      ) : null}
    </View>
  );
}

function riskTone(level: string): Tone {
  const l = level.toLowerCase();
  return l.includes("high") ? "red" : l.includes("medium") || l.includes("moderate") ? "amber" : l.includes("low") ? "green" : "gray";
}

function Measure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const t = useTheme();
  return (
    <View style={[s.measure, { backgroundColor: t.muted2 }]}>
      <Text style={{ color: t.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={{ color: warn ? t.warn : t.text, fontWeight: "800", fontSize: 16, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

function RiskRecord({ data }: { data: RiskRecordData }) {
  const t = useTheme();
  const ra = data?.result?.risk_assessment ?? {};
  const level = String(ra.risk_level ?? "Unknown");
  const pct = probabilityToPercent(ra.risk_probability);
  const c = toneColors(t, riskTone(level));
  const i = data?.input ?? ({} as RiskRecordData["input"]);
  const recs = (data?.result?.recommendations ?? {}) as Record<string, string[] | undefined>;
  const n = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.banner, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.fg, fontSize: 24, fontWeight: "800" }}>{level} risk</Text>
        <Text style={{ color: t.muted }}>
          {pct != null ? `Probability ${pct}%` : ""}
          {typeof ra.confidence === "number" ? ` · confidence ${Math.round(ra.confidence * 100)}%` : ""}
        </Text>
        {Array.isArray(ra.risk_factors) && ra.risk_factors.length ? <Bullets items={ra.risk_factors.map(String)} color={c.fg} /> : null}
      </View>
      <Card>
        <SectionLabel>Measurements entered</SectionLabel>
        <View style={s.grid}>
          <Measure label="Blood pressure" value={`${n(i.systolic_bp)}/${n(i.diastolic_bp)}`} warn={Number(i.systolic_bp) >= 140 || Number(i.diastolic_bp) >= 90} />
          <Measure label="Blood sugar" value={`${n(i.blood_sugar)} mmol/L`} warn={Number(i.blood_sugar) > 7.8} />
          <Measure label="Heart rate" value={`${n(i.heart_rate)} bpm`} warn={Number(i.heart_rate) > 100} />
          <Measure label="Body temp" value={`${n(i.body_temp)} °F`} warn={Number(i.body_temp) >= 100.4} />
          <Measure label="BMI" value={n(i.bmi)} />
          <Measure label="Age" value={n(i.age)} />
        </View>
      </Card>
      <Refined refined={data?.refined ?? null} />
      {([
        ["Do now", recs.immediate_actions],
        ["Lifestyle changes", recs.lifestyle_changes],
        ["Monitoring", recs.monitoring_requirements],
        ["Consultations", recs.medical_consultations],
      ] as const).map(([title, items]) =>
        items?.length ? (
          <Card key={title}>
            <H2>{title}</H2>
            <Bullets items={items} />
          </Card>
        ) : null,
      )}
    </View>
  );
}

function DietPlanRecord({ data }: { data: DietPlanRecordData }) {
  const info = data?.pregnancy_info ?? ({} as DietPlanRecordData["pregnancy_info"]);
  const di = data?.doctor_instructions;
  const recipes = Array.isArray(data?.recipes) ? data.recipes : [];
  const conditions = [
    info.has_gestational_diabetes && "Gestational diabetes",
    info.has_anemia && "Anaemia",
    info.has_morning_sickness && "Morning sickness",
    info.has_heartburn && "Heartburn",
    info.has_constipation && "Constipation",
  ].filter(Boolean) as string[];
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <SectionLabel>Profile used for this plan</SectionLabel>
        <View style={s.grid}>
          <Measure label="Month" value={String(info.pregnancy_month ?? "—")} />
          <Measure label="Weight" value={`${info.current_weight ?? "—"} kg`} />
          <Measure label="Height" value={`${info.height ?? "—"} cm`} />
          <Measure label="Activity" value={String(info.activity_level ?? "moderate")} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {conditions.map((x) => <Pill key={x} tone="amber">{x}</Pill>)}
          {(info.dietary_restrictions ?? []).map((x) => <Pill key={x} tone="blue">{x}</Pill>)}
          {(info.food_aversions ?? []).map((x) => <Pill key={x}>{`avoids ${x}`}</Pill>)}
        </View>
      </Card>
      {di && (di.avoid.length || di.include.length || di.restrictions.length || di.note) ? (
        <InfoBox>
          {doctorName(di.by)}’s instructions were applied.
          {di.restrictions.length ? ` Diet: ${di.restrictions.join(", ")}.` : ""}
          {di.avoid.length ? ` Avoid: ${di.avoid.join(", ")}.` : ""}
          {di.include.length ? ` Include: ${di.include.join(", ")}.` : ""}
        </InfoBox>
      ) : null}
      <Refined refined={data?.refined ?? null} />
      {recipes.map((r, idx) => <RecipeCard key={`${r.Name}-${idx}`} recipe={r} />)}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------

function VerdictBanner({ record }: { record: HealthRecord }) {
  const t = useTheme();
  if (record.review_status !== "reviewed" || !record.verdict) return null;
  const v = VERDICT_COPY[record.verdict];
  const c = toneColors(t, v.tone);
  return (
    <View style={[s.banner, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontWeight: "800", fontSize: 16 }}>✓ {v.label}</Text>
      <Text style={{ color: t.text }}>{v.patientLine}</Text>
      <Text style={{ color: t.muted, fontSize: 12 }}>{doctorName(record.reviewer_name)} · {formatDateTime(record.reviewed_at)}</Text>
    </View>
  );
}

export function PatientReviewPanel({ record, active, onChanged }: { record: HealthRecord; active: CareLink | null; onChanged: (r: HealthRecord) => void }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doctor = active?.doctor ?? null;
  const dr = doctor ? doctorName(doctor.full_name) : null;

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      onChanged({ ...record, ...(await requestReview(record.id, null)) });
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't send the request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <SectionLabel>Doctor’s review</SectionLabel>
        <VerdictBanner record={record} />
        {record.review_status === "requested" ? (
          <View style={[s.banner, { backgroundColor: t.infoSoft }]}>
            <Text style={{ color: t.info, fontWeight: "800" }}>Waiting for {dr ?? "a doctor"} to review</Text>
            <Text style={{ color: t.text }}>Requested {timeAgo(record.review_requested_at)}. {doctor ? "You’ll see the reply here." : "Choose a doctor and it will be in their inbox."}</Text>
          </View>
        ) : null}
        {record.review_status === "none" ? (
          <Body muted>{doctor ? `${dr} can see this record. Ask for a review if you’d like their opinion.` : "Not reviewed yet. Choose a doctor to get your records reviewed."}</Body>
        ) : null}
        {doctor && record.review_status !== "requested" ? (
          <Button title={record.review_status === "reviewed" ? `Ask ${dr} again` : `Ask ${dr} to review`} onPress={ask} loading={busy} variant={record.review_status === "reviewed" ? "secondary" : "primary"} />
        ) : null}
        {!doctor ? <Button title="Choose a doctor" onPress={() => router.push({ pathname: "/care/doctors", params: { next: `/care/record/${record.id}` } })} /> : null}
        {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
      </Card>
      <Card>
        <SectionLabel>Comments</SectionLabel>
        <Thread
          patientId={record.patient_id}
          recordId={record.id}
          canWrite={Boolean(doctor)}
          disabledReason="Choose a doctor to comment on your records."
          placeholder={dr ? `Ask ${dr} about this record…` : ""}
          emptyText="No comments yet."
        />
      </Card>
    </View>
  );
}

const VERDICT_HINT: Record<Verdict, string> = {
  looks_fine: "Nothing to change",
  needs_changes: "Explain what to change",
  see_me: "Ask the patient to come in",
};

export function DoctorReviewPanel({ record, onReviewed }: { record: HealthRecord; onReviewed: () => void }) {
  const t = useTheme();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!verdict) return;
    setBusy(true);
    setError(null);
    try {
      await sendMessage(record.patient_id, note.trim(), record.id, verdict);
      setVerdict(null);
      setNote("");
      setSent(true);
      onReviewed();
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't send the review."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <SectionLabel>Your review</SectionLabel>
          {record.review_status === "requested" ? (
            <Pill tone="blue">Requested {timeAgo(record.review_requested_at)}</Pill>
          ) : record.verdict ? (
            <Pill tone={VERDICT_COPY[record.verdict].tone}>{VERDICT_COPY[record.verdict].label}</Pill>
          ) : (
            <Pill>Not reviewed</Pill>
          )}
        </View>
        {sent ? <Text style={{ color: t.success }}>Review sent. The patient sees it straight away.</Text> : null}
        {(Object.keys(VERDICT_COPY) as Verdict[]).map((v) => {
          const on = verdict === v;
          const c = toneColors(t, VERDICT_COPY[v].tone);
          return (
            <Pressable
              key={v}
              onPress={() => setVerdict(v)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[s.verdict, { borderColor: on ? c.fg : t.border, backgroundColor: on ? c.bg : t.card }]}
            >
              <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? c.fg : t.muted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: on ? c.fg : t.text, fontWeight: "800" }}>{VERDICT_COPY[v].label}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{VERDICT_HINT[v]}</Text>
              </View>
            </Pressable>
          );
        })}
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={4000}
          placeholder="Note to the patient (what she should know or do)"
          placeholderTextColor={t.muted}
          style={[s.note, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
        />
        {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
        <Pressable
          onPress={submit}
          disabled={!verdict || busy}
          accessibilityRole="button"
          style={[s.doctorBtn, { backgroundColor: t.info, opacity: !verdict || busy ? 0.5 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{record.review_status === "reviewed" ? "Send updated review" : "Send review"}</Text>}
        </Pressable>
      </Card>
      <Card>
        <SectionLabel>Comments with the patient</SectionLabel>
        <Thread patientId={record.patient_id} recordId={record.id} canWrite doctorAccent placeholder="Reply about this record…" emptyText="No comments yet." />
      </Card>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------

export function DietSummary({ d }: { d: DietInstructions }) {
  const t = useTheme();
  const row = (label: string, value: string, color: string) => (
    <View style={{ gap: 2 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>{label}</Text>
      <Text style={{ color: t.text }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      {d.restrictions.length ? row("DIET", d.restrictions.join(", "), t.muted) : null}
      {d.avoid.length ? row("AVOID", d.avoid.join(", "), t.danger) : null}
      {d.include.length ? row("INCLUDE", d.include.join(", "), t.success) : null}
      {d.note ? <Text style={{ color: t.text, fontStyle: "italic" }}>“{d.note}”</Text> : null}
    </View>
  );
}

const RESTRICTIONS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "egg-free", "nut-free", "soy-free"];
const splitList = (s: string) => Array.from(new Set(s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)));

export function DietInstructionsEditor({ patientId, current, onSaved }: { patientId: string; current: DietInstructions | null; onSaved: (d: DietInstructions) => void }) {
  const t = useTheme();
  const [avoid, setAvoid] = useState((current?.avoid ?? []).join(", "));
  const [include, setInclude] = useState((current?.include ?? []).join(", "));
  const [restrictions, setRestrictions] = useState<string[]>(current?.restrictions ?? []);
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const d = await setDietInstructions(patientId, { avoid: splitList(avoid), include: splitList(include), restrictions, note: note.trim() || null });
      setAvoid(d.avoid.join(", "));
      setInclude(d.include.join(", "));
      setRestrictions(d.restrictions);
      onSaved(d);
      setMsg({ ok: true, text: "Saved. The patient's diet planner applies them now." });
    } catch (e) {
      setMsg({ ok: false, text: careErrorMessage(e, "Couldn't save the instructions.") });
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, multiline = false) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.text, fontWeight: "700" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={set}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        multiline={multiline}
        autoCapitalize="none"
        style={[s.note, { minHeight: multiline ? 80 : 46, backgroundColor: t.input, borderColor: t.border, color: t.text }]}
      />
    </View>
  );

  return (
    <Card>
      <SectionLabel>Diet instructions</SectionLabel>
      <Body muted>Applied automatically in the patient’s diet planner.</Body>
      {field("Avoid", avoid, setAvoid, "papaya, raw sprouts (comma separated)")}
      {field("Include more", include, setInclude, "spinach, lentils, dates")}
      <Text style={{ color: t.text, fontWeight: "700" }}>Diet</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {RESTRICTIONS.map((r) => {
          const on = restrictions.includes(r);
          return (
            <Pressable
              key={r}
              onPress={() => setRestrictions(on ? restrictions.filter((x) => x !== r) : [...restrictions, r])}
              accessibilityState={{ selected: on }}
              style={[s.chip, { borderColor: on ? t.info : t.border, backgroundColor: on ? t.infoSoft : t.card }]}
            >
              <Text style={{ color: on ? t.info : t.text, fontWeight: on ? "700" : "400" }}>{r}</Text>
            </Pressable>
          );
        })}
      </View>
      {field("Note to the patient", note, setNote, "e.g. Iron-rich food twice a day", true)}
      {msg ? <Text style={{ color: msg.ok ? t.success : t.danger }}>{msg.text}</Text> : null}
      <Pressable onPress={save} disabled={busy} accessibilityRole="button" style={[s.doctorBtn, { backgroundColor: t.info, opacity: busy ? 0.6 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Save instructions</Text>}
      </Pressable>
      {current?.updated_at ? <Text style={{ color: t.muted, fontSize: 12 }}>Last updated {formatDateTime(current.updated_at)} by {doctorName(current.updated_by_name)}</Text> : null}
    </Card>
  );
}

const s = StyleSheet.create({
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  banner: { borderRadius: 16, padding: 14, gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  measure: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minWidth: "47%", flexGrow: 1 },
  verdict: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  note: { borderWidth: 1, borderRadius: 12, minHeight: 90, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, fontSize: 15, textAlignVertical: "top" },
  doctorBtn: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
});
