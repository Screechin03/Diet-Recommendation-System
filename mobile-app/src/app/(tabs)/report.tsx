import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Body, Disclaimer, ErrorBox, Field, Screen, ToggleRow } from "@/components/ui";
import { DietPlanCard, ReportCard, ScanCard } from "@/components/ReportViews";
import { useTheme } from "@/components/theme";
import { prescriptionReport, scanHandwriting } from "@/lib/api";
import {
  formatBytes,
  isEmptyReport,
  normalizeDietPlan,
  normalizeReport,
  type OcrResult,
  type PrescriptionApiResponse,
} from "@/lib/report";
import type { PickedFile } from "@/lib/types";

type Mode = "full" | "scan";
type IconName = ComponentProps<typeof Ionicons>["name"];

const STAGES: Record<Mode, Array<{ label: string; at: number }>> = {
  full: [
    { label: "Uploading document", at: 0 },
    { label: "Scanning handwriting", at: 2 },
    { label: "Reading medicines & tests", at: 5 },
    { label: "Writing your diet plan", at: 15 },
  ],
  scan: [
    { label: "Uploading", at: 0 },
    { label: "Finding characters", at: 1 },
    { label: "Recognising letters", at: 2 },
  ],
};

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const mimeType = asset.mimeType ?? "image/jpeg";
  const ext = mimeType.split("/")[1] ?? "jpg";
  return { uri: asset.uri, name: asset.fileName ?? `report.${ext}`, mimeType, size: asset.fileSize };
}

export default function ReportScreen() {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>("full");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState("");
  const [allergies, setAllergies] = useState("");
  const [goals, setGoals] = useState("");
  const [includePlan, setIncludePlan] = useState(true);

  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<PrescriptionApiResponse | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), 300);
    return () => clearInterval(id);
  }, [loading]);
  useEffect(() => () => {
    requestId.current += 1; // ignore late responses after unmount
  }, []);

  const extracted = useMemo(() => normalizeReport(report?.extracted), [report]);
  const plan = useMemo(() => normalizeDietPlan(report?.diet_plan), [report]);
  const stages = STAGES[mode];
  const activeStage = stages.reduce((acc, st, i) => (elapsed >= st.at ? i : acc), 0);

  function choose(next: PickedFile | null) {
    if (next?.size && next.size > 10 * 1024 * 1024) {
      setError(`That file is ${formatBytes(next.size)}. The limit is 10 MB.`);
      return;
    }
    setFile(next);
    setError(null);
    setNotice(null);
    setReport(null);
    setOcr(null);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera permission needed", "Allow camera access in Settings to photograph your report.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.85 });
    if (!res.canceled && res.assets[0]) choose(fromImageAsset(res.assets[0]));
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.85 });
    if (!res.canceled && res.assets[0]) choose(fromImageAsset(res.assets[0]));
  }

  async function pickPdf() {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    const asset = !res.canceled ? res.assets[0] : null;
    if (asset) choose({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/pdf", size: asset.size });
  }

  async function submit() {
    if (!file || loading) return;
    const id = ++requestId.current;
    setLoading(true);
    setElapsed(0);
    setError(null);
    setNotice(null);
    setReport(null);
    setOcr(null);
    try {
      if (mode === "full") {
        const data = await prescriptionReport(file, { dietaryPreferences: prefs, allergies, goals, includeDietPlan: includePlan });
        if (id !== requestId.current) return;
        setReport(data);
        setOcr(data.ocr ?? null);
        if (!data.success) {
          if (data.ocr) setNotice(`${data.error ?? "AI reading failed."} Your handwriting scan is below.`);
          else setError(data.error ?? "We couldn't read this document. Try a sharper, well-lit photo.");
        }
      } else {
        const data = await scanHandwriting(file);
        if (id !== requestId.current) return;
        setOcr(data.ocr ?? null);
        if (!data.success || !data.ocr) setError(data.error ?? "The scanner couldn't process this file.");
      }
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const hasStructured = !isEmptyReport(extracted);
  const sources: Array<{ icon: IconName; label: string; onPress: () => void }> = [
    { icon: "camera-outline", label: "Camera", onPress: takePhoto },
    { icon: "images-outline", label: "Photos", onPress: pickPhoto },
    { icon: "document-text-outline", label: "PDF", onPress: pickPdf },
  ];

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={[st.eyebrow, { color: t.primary }]}>PRESCRIPTION & REPORT READER</Text>
        <Text style={[st.title, { color: t.text }]}>Turn a doctor’s note into a plan</Text>
        <Body muted>We list the medicines and test results, flag anything unclear, and suggest pregnancy-friendly meals.</Body>
      </View>

      <View style={[st.segment, { backgroundColor: t.muted2 }]} accessibilityRole="tablist">
        {([
          ["full", "Full report", "sparkles-outline"],
          ["scan", "Handwriting scan", "scan-outline"],
        ] as const).map(([value, label, icon]) => {
          const on = mode === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              disabled={loading}
              onPress={() => setMode(value)}
              style={[st.segBtn, on && { backgroundColor: t.card, shadowOpacity: 0.08 }]}
            >
              <Ionicons name={icon} size={15} color={on ? t.text : t.muted} />
              <Text style={{ color: on ? t.text : t.muted, fontWeight: "600", fontSize: 14 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: t.muted, fontSize: 12.5, lineHeight: 18, marginTop: -6 }}>
        {mode === "full"
          ? "AI reads printed and handwritten documents, then builds a diet plan. About 10–30 seconds."
          : "Instant scan for writing in separate BLOCK CAPITALS and numbers. Joined-up writing needs Full report."}
      </Text>

      {file ? (
        <View style={[st.fileRow, { backgroundColor: t.card, borderColor: t.border }]}>
          {file.mimeType.startsWith("image/") ? (
            <Image source={{ uri: file.uri }} style={st.thumb} />
          ) : (
            <View style={[st.thumb, { backgroundColor: t.primarySoft, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="document-text-outline" size={28} color={t.primary} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: "600" }}>{file.name}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {file.mimeType === "application/pdf" ? "PDF · first page scanned" : "Photo"}
              {file.size ? ` · ${formatBytes(file.size)}` : ""}
            </Text>
          </View>
          <Pressable onPress={() => choose(null)} disabled={loading} hitSlop={10} accessibilityLabel="Remove file">
            <Ionicons name="close-circle" size={24} color={t.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        {sources.map((src) => (
          <Pressable
            key={src.label}
            onPress={src.onPress}
            disabled={loading}
            accessibilityRole="button"
            style={({ pressed }) => [
              st.source,
              { backgroundColor: t.card, borderColor: t.border, opacity: loading ? 0.5 : pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[st.sourceIcon, { backgroundColor: t.primarySoft }]}>
              <Ionicons name={src.icon} size={20} color={t.primary} />
            </View>
            <Text style={{ color: t.text, fontWeight: "600", fontSize: 13 }}>{src.label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "full" ? (
        <View style={[st.prefs, { backgroundColor: t.card, borderColor: t.border }]}>
          <Pressable onPress={() => setPrefsOpen((v) => !v)} style={st.prefsHead} accessibilityRole="button">
            <Text style={{ color: t.text, fontWeight: "600", flex: 1 }}>Personalise the diet plan</Text>
            <Ionicons name={prefsOpen ? "chevron-up" : "chevron-down"} size={18} color={t.muted} />
          </Pressable>
          {prefsOpen ? (
            <View style={{ gap: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
              <Field label="Food preferences" placeholder="vegetarian, low salt" value={prefs} onChangeText={setPrefs} />
              <Field label="Allergies" placeholder="peanuts, lactose" value={allergies} onChangeText={setAllergies} />
              <Field label="Goals" placeholder="raise iron levels" value={goals} onChangeText={setGoals} />
              <ToggleRow label="Include a diet plan" value={includePlan} onChange={setIncludePlan} />
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={submit}
        disabled={!file || loading}
        accessibilityRole="button"
        style={({ pressed }) => [st.cta, { backgroundColor: t.text, opacity: !file || loading ? 0.5 : pressed ? 0.85 : 1 }]}
      >
        {loading ? <ActivityIndicator color={t.card} /> : null}
        <Text style={{ color: t.card, fontWeight: "700", fontSize: 16 }}>
          {loading ? `Reading… ${Math.floor(elapsed)}s` : mode === "full" ? "Read my report" : "Scan handwriting"}
        </Text>
      </Pressable>

      {loading ? (
        <View style={[st.stages, { backgroundColor: t.card, borderColor: t.border }]} accessibilityLiveRegion="polite">
          {stages.map((stage, i) => {
            const done = i < activeStage;
            const active = i === activeStage;
            return (
              <View key={stage.label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={[
                    st.stageDot,
                    { backgroundColor: done ? t.success : active ? t.primarySoft : t.muted2, borderColor: active ? t.primary : "transparent" },
                  ]}
                >
                  {done ? <Ionicons name="checkmark" size={12} color="#fff" /> : <Text style={{ fontSize: 10, color: t.muted }}>{i + 1}</Text>}
                </View>
                <Text style={{ color: i <= activeStage ? t.text : t.muted, flex: 1 }}>{stage.label}</Text>
                {active ? <ActivityIndicator size="small" color={t.primary} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <ErrorBox message={error} />
      {notice ? (
        <View style={[st.notice, { backgroundColor: t.infoSoft }]}>
          <Ionicons name="information-circle-outline" size={20} color={t.info} />
          <Text style={{ color: t.text, flex: 1, lineHeight: 20 }}>{notice}</Text>
        </View>
      ) : null}

      {!file && !loading && !report && !ocr ? (
        <View style={[st.tips, { borderColor: t.border }]}>
          <Text style={{ color: t.text, fontWeight: "700" }}>For the best result</Text>
          {[
            ["sunny-outline", "Flat and well lit, no shadows across the writing"],
            ["scan-outline", "Fill the frame with the page"],
            ["document-outline", "One page at a time"],
          ].map(([icon, text]) => (
            <View key={text} style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Ionicons name={icon as IconName} size={18} color={t.primary} />
              <Text style={{ color: t.muted, flex: 1 }}>{text}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {hasStructured && extracted ? <ReportCard report={extracted} /> : null}
      {report?.success && !hasStructured ? (
        <View style={[st.notice, { backgroundColor: t.muted2 }]}>
          <Text style={{ color: t.text }}>No medicines or test results were found in this document.</Text>
        </View>
      ) : null}
      {plan ? <DietPlanCard plan={plan} /> : null}
      {ocr ? <ScanCard ocr={ocr} /> : null}

      <Disclaimer />
    </Screen>
  );
}

const st = StyleSheet.create({
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  title: { fontSize: 25, fontWeight: "800", letterSpacing: -0.3 },
  segment: { flexDirection: "row", borderRadius: 14, padding: 4, gap: 4 },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 10 },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  source: { flex: 1, alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 16, paddingVertical: 14 },
  sourceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  prefs: { borderWidth: 1, borderRadius: 16 },
  prefsHead: { flexDirection: "row", alignItems: "center", padding: 14 },
  cta: { height: 54, borderRadius: 14, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  stages: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  stageDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  notice: { flexDirection: "row", gap: 10, borderRadius: 14, padding: 14, alignItems: "flex-start" },
  tips: { borderWidth: 1, borderStyle: "dashed", borderRadius: 16, padding: 16, gap: 12 },
});
