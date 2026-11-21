import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ErrorBox, InfoBox, Screen } from "@/components/ui";
import { KindIcon, Pill, ReviewPill, SeverityPill } from "@/components/Care";
import { DoctorReviewPanel, RecordContent } from "@/components/CareRecord";
import { useTheme } from "@/components/theme";
import { useLiveData } from "@/lib/careHooks";
import { careErrorMessage, formatDateTime, getPatientProfile, getRecord, KIND_COPY, type HealthRecord } from "@/lib/care";

export default function DoctorRecordScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [record, setRecord] = useState<HealthRecord | null | undefined>(undefined);
  const [patientName, setPatientName] = useState("Patient");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getRecord(id);
      setRecord(r);
      if (r) {
        const p = await getPatientProfile(r.patient_id);
        if (p?.full_name) setPatientName(p.full_name);
      }
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load this record."));
    }
  }, [id]);
  useLiveData(load, 30_000);

  if (record === undefined && !error) {
    return (
      <Screen>
        <ActivityIndicator color={t.info} />
      </Screen>
    );
  }
  if (!record) {
    return (
      <Screen>
        {error ? <ErrorBox message={error} /> : <InfoBox>This record isn’t available. The patient may have deleted it or is no longer connected to you.</InfoBox>}
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: patientName }} />
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <KindIcon kind={record.kind} size={46} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{record.title}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{patientName} · {KIND_COPY[record.kind].label} · {formatDateTime(record.created_at)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {record.severity !== "info" ? <SeverityPill severity={record.severity} /> : null}
            <ReviewPill record={record} doctorView />
            {record.is_sample ? <Pill tone="amber">Sample data</Pill> : null}
          </View>
        </View>
      </View>
      <ErrorBox message={error} />
      <DoctorReviewPanel record={record} onReviewed={() => void load()} />
      <RecordContent record={record} />
    </Screen>
  );
}
