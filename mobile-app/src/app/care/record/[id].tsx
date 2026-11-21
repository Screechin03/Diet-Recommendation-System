import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, ErrorBox, InfoBox, Screen } from "@/components/ui";
import { KindIcon, Pill, ReviewPill, SeverityPill } from "@/components/Care";
import { PatientReviewPanel, RecordContent } from "@/components/CareRecord";
import { useTheme } from "@/components/theme";
import { useCareLinks, useLiveData } from "@/lib/careHooks";
import { careErrorMessage, deleteRecord, formatDateTime, getRecord, KIND_COPY, type HealthRecord } from "@/lib/care";
import { confirmAction } from "@/lib/confirm";

export default function PatientRecordScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useCareLinks();
  const [record, setRecord] = useState<HealthRecord | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setRecord(await getRecord(id));
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load this record."));
    }
  }, [id]);
  useLiveData(load, 30_000);

  async function doDelete() {
    if (!record) return;
    setDeleting(true);
    try {
      await deleteRecord(record);
      router.back();
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't delete this record."));
      setDeleting(false);
    }
  }

  async function confirmDelete() {
    if (await confirmAction("Delete record?", "This record and its comments will be deleted. This can't be undone.", "Delete")) {
      void doDelete();
    }
  }

  if (record === undefined && !error) {
    return (
      <Screen>
        <ActivityIndicator color={t.primary} />
      </Screen>
    );
  }
  if (!record) {
    return (
      <Screen>
        {error ? <ErrorBox message={error} /> : <InfoBox>This record was not found. It may have been deleted.</InfoBox>}
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: KIND_COPY[record.kind].label }} />
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <KindIcon kind={record.kind} size={46} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: "800" }}>{record.title}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{formatDateTime(record.created_at)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {record.severity !== "info" ? <SeverityPill severity={record.severity} /> : null}
            <ReviewPill record={record} />
            {record.is_sample ? <Pill>Sample data</Pill> : null}
          </View>
        </View>
      </View>
      <ErrorBox message={error} />
      <PatientReviewPanel record={record} active={active} onChanged={setRecord} />
      <RecordContent record={record} />
      <Button title="Delete record" variant="danger" onPress={confirmDelete} loading={deleting} />
    </Screen>
  );
}
