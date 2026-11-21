import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Body, Button, Chips, Disclaimer, ErrorBox, Field, InfoBox, Screen, SectionLabel } from "@/components/ui";
import { VitalsResult } from "@/components/VitalsViews";
import { useTheme } from "@/components/theme";
import { analyzeVitalsDemo, analyzeVitalsFile, vitalsReportPdf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadProfile } from "@/lib/profile";
import { ReviewPill, ShareWithDoctor, toneColors } from "@/components/Care";
import { listRecordsOfKind, SEVERITY_COPY, timeAgo, updatePregnancyMonth, type HealthRecord } from "@/lib/care";
import { vitalsRecord } from "@/lib/careRecords";
import { type VitalsAnalysis } from "@/lib/vitals";

const SCENARIOS = [
  { value: "normal", label: "Healthy" },
  { value: "tachycardia", label: "High heart rate" },
  { value: "low_spo2", label: "Low oxygen" },
  { value: "fever", label: "Fever" },
  { value: "irregular", label: "Irregular beat" },
];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => ({ value: m, label: String(m) }));

export default function VitalsScreen() {
  const t = useTheme();
  const { user, role, careAvailable } = useAuth();
  const showHistory = Boolean(user) && role === "patient" && careAvailable;
  const [month, setMonth] = useState<number | null>(() => loadProfile().pregnancy_month ?? null);
  const [activity, setActivity] = useState<"rest" | "exercise">("rest");
  const [scenario, setScenario] = useState("normal");

  const [busy, setBusy] = useState<null | "file" | "demo">(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VitalsAnalysis | null>(null);
  const [resultId, setResultId] = useState(0);
  const [name, setName] = useState("");
  const [sharing, setSharing] = useState(false);

  const [history, setHistory] = useState<HealthRecord[] | null>(null);

  const loadHistory = useCallback(async () => {
    if (!user || !showHistory) return;
    try {
      setHistory(await listRecordsOfKind(user.id, "vitals", 5));
    } catch {
      setHistory([]);
    }
  }, [user, showHistory]);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function importFile() {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    const asset = !res.canceled ? res.assets[0] : null;
    if (!asset) return;
    if (!/\.(jsonl|txt|json)$/i.test(asset.name)) {
      setError("Choose the session file from the device’s SD card (a .jsonl file).");
      return;
    }
    setBusy("file");
    try {
      const a = await analyzeVitalsFile(
        { uri: asset.uri, name: asset.name, mimeType: "application/octet-stream", size: asset.size },
        { pregnancyMonth: month, activity },
      );
      setResult(a);
      setResultId((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file couldn't be analysed.");
    } finally {
      setBusy(null);
    }
  }

  async function runDemo() {
    setError(null);
    setBusy("demo");
    try {
      setResult(await analyzeVitalsDemo(scenario, { pregnancyMonth: month, activity }));
      setResultId((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sample couldn't be loaded.");
    } finally {
      setBusy(null);
    }
  }

  async function sharePdf() {
    if (!result) return;
    setSharing(true);
    setError(null);
    try {
      const bytes = await vitalsReportPdf(result, { name: name.trim() || null, pregnancy_month: result.session.pregnancy_month });
      const file = new File(Paths.cache, `mamacare-vitals-${result.analyzed_at.slice(0, 10)}.pdf`);
      if (file.exists) file.delete();
      file.create();
      await file.write(new Uint8Array(bytes));
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
      await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Share vitals report" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the PDF.");
    } finally {
      setSharing(false);
    }
  }

  if (result) {
    return (
      // A new scroll view per result, so it opens at the top (where the share panel is).
      <Screen key={`result-${resultId}`}>
        <ShareWithDoctor
          key={resultId}
          build={() => vitalsRecord(result)}
          what="this measurement"
          onSaved={() => {
            const m = result.session.pregnancy_month;
            if (user && m && !result.demo) void updatePregnancyMonth(user.id, m).catch(() => undefined);
            void loadHistory();
          }}
        />
        <VitalsResult analysis={result} />
        <View style={[st.card, { backgroundColor: t.card, borderColor: t.border }]}>
          <SectionLabel>Your report</SectionLabel>
          <Body muted>A PDF with these results and the ECG sample, to keep or send to your doctor.</Body>
          <Field label="Name on the report (optional)" value={name} onChangeText={setName} maxLength={80} />
          <Button title={sharing ? "Creating PDF…" : "Share PDF report"} onPress={sharePdf} loading={sharing} />
        </View>
        <ErrorBox message={error} />
        <Button title="New measurement" variant="secondary" onPress={() => setResult(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={[st.eyebrow, { color: t.primary }]}>HOME MONITORING</Text>
        <Text style={[st.title, { color: t.text }]}>Your vital signs, explained</Text>
        <Body muted>Heart rate, blood oxygen, temperature and ECG from the MamaCare device, checked against pregnancy ranges.</Body>
      </View>

      <View style={[st.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <SectionLabel>About you</SectionLabel>
        <Body>Month of pregnancy</Body>
        <Chips options={MONTHS} selected={month ? [month] : []} onToggle={(m) => setMonth(month === m ? null : m)} />
        <Body>When measured</Body>
        <Chips
          options={[{ value: "rest" as const, label: "At rest" }, { value: "exercise" as const, label: "After exercise" }]}
          selected={[activity]}
          onToggle={setActivity}
        />
      </View>

      <Pressable
        onPress={importFile}
        disabled={busy !== null}
        accessibilityRole="button"
        style={({ pressed }) => [st.source, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[st.icon, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="document-attach-outline" size={22} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>Import from the SD card</Text>
          <Text style={{ color: t.muted, marginTop: 2 }}>Choose the device’s session file (.jsonl)</Text>
        </View>
        {busy === "file" ? <ActivityIndicator color={t.primary} /> : <Ionicons name="chevron-forward" size={20} color={t.muted} />}
      </Pressable>

      <View style={[st.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <SectionLabel>No device yet?</SectionLabel>
        <Body muted>Try a simulated recording to see how the analysis and report work.</Body>
        <Chips options={SCENARIOS} selected={[scenario]} onToggle={setScenario} />
        <Button title="Analyse a sample" variant="secondary" onPress={runDemo} loading={busy === "demo"} disabled={busy !== null} />
      </View>

      <InfoBox>Live monitoring over a USB cable works on the website, in Chrome or Edge on a computer.</InfoBox>
      <ErrorBox message={error} />

      {showHistory && history?.length ? (
        <View style={{ gap: 8 }}>
          <SectionLabel>Recent sessions</SectionLabel>
          {history.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => router.push({ pathname: "/care/record/[id]", params: { id: row.id } })}
              accessibilityRole="button"
              style={[st.histRow, { backgroundColor: t.card, borderColor: t.border }]}
            >
              <View style={[st.dot, { backgroundColor: toneColors(t, SEVERITY_COPY[row.severity].tone).fg }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "600" }} numberOfLines={1}>{row.summary ?? row.title}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{timeAgo(row.created_at)}{row.is_sample ? " · sample" : ""}</Text>
              </View>
              <ReviewPill record={row} />
            </Pressable>
          ))}
          <Button title="All records in My care" variant="secondary" onPress={() => router.push("/account")} />
        </View>
      ) : null}

      <Disclaimer />
    </Screen>
  );
}

const st = StyleSheet.create({
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.6 },
  title: { fontSize: 25, fontWeight: "800", letterSpacing: -0.3 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  source: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 18, padding: 16 },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  histRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
