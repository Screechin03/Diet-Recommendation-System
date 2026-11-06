import { useState } from "react";
import { Alert, Image, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Body,
  Button,
  Card,
  Disclaimer,
  ErrorBox,
  Field,
  H2,
  Row,
  Col,
  Screen,
  SectionLabel,
  ToggleRow,
} from "@/components/ui";
import { JsonSections } from "@/components/JsonSections";
import { useTheme } from "@/components/theme";
import { prescriptionReport } from "@/lib/api";
import type { PickedFile, PrescriptionReport } from "@/lib/types";

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const mimeType = asset.mimeType ?? "image/jpeg";
  const ext = mimeType.split("/")[1] ?? "jpg";
  return { uri: asset.uri, name: asset.fileName ?? `report.${ext}`, mimeType };
}

export default function ReportScreen() {
  const t = useTheme();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [prefs, setPrefs] = useState("");
  const [allergies, setAllergies] = useState("");
  const [goals, setGoals] = useState("");
  const [includePlan, setIncludePlan] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PrescriptionReport | null>(null);

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera permission needed", "Allow camera access in Settings to photograph your report.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.8 });
    if (!res.canceled && res.assets[0]) setFile(fromImageAsset(res.assets[0]));
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.8 });
    if (!res.canceled && res.assets[0]) setFile(fromImageAsset(res.assets[0]));
  }

  async function pickPdf() {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    const asset = !res.canceled ? res.assets[0] : null;
    if (asset) setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/pdf" });
  }

  async function submit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const data = await prescriptionReport(file, {
        dietaryPreferences: prefs,
        allergies,
        goals,
        includeDietPlan: includePlan,
      });
      setReport(data);
      if (!data.success) setError(data.error || "Could not read this document. Try a clearer photo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Card>
        <SectionLabel>Prescription or lab report</SectionLabel>
        <Body muted>Take a clear photo or upload a PDF. We’ll pull out medicines, tests and instructions, then suggest a diet plan.</Body>
        <Row gap={8}>
          <Col><Button title="Camera" variant="secondary" onPress={takePhoto} /></Col>
          <Col><Button title="Photos" variant="secondary" onPress={pickPhoto} /></Col>
          <Col><Button title="PDF" variant="secondary" onPress={pickPdf} /></Col>
        </Row>
        {file ? (
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            {file.mimeType.startsWith("image/") ? (
              <Image source={{ uri: file.uri }} style={{ width: 64, height: 64, borderRadius: 8 }} />
            ) : (
              <Ionicons name="document-outline" size={40} color={t.primary} />
            )}
            <Text style={{ color: t.text, flex: 1 }} numberOfLines={2}>{file.name}</Text>
            <Ionicons name="close-circle" size={24} color={t.muted} onPress={() => setFile(null)} accessibilityLabel="Remove file" />
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionLabel>Optional preferences</SectionLabel>
        <Field label="Dietary preferences" placeholder="e.g. vegetarian, low sodium" value={prefs} onChangeText={setPrefs} />
        <Field label="Allergies" placeholder="e.g. peanuts, lactose" value={allergies} onChangeText={setAllergies} />
        <Field label="Goals" placeholder="e.g. improve iron intake" value={goals} onChangeText={setGoals} />
        <ToggleRow label="Generate diet plan" value={includePlan} onChange={setIncludePlan} />
      </Card>

      <Button title={loading ? "Reading report…" : "Read my report"} onPress={submit} loading={loading} disabled={!file} />
      <ErrorBox message={error} />

      {report?.extracted ? (
        <Card>
          <H2>What we found</H2>
          <JsonSections data={report.extracted} />
        </Card>
      ) : null}

      {report?.diet_plan ? (
        <Card>
          <H2>Diet plan</H2>
          <JsonSections data={report.diet_plan} />
        </Card>
      ) : null}

      <Disclaimer />
    </Screen>
  );
}
