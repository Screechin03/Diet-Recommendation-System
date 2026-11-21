import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Body, Button, Card, Chips, ErrorBox, InfoBox, Screen, SectionLabel } from "@/components/ui";
import { Avatar, Pill, RecordRow, Thread } from "@/components/Care";
import { DietInstructionsEditor } from "@/components/CareRecord";
import { useTheme } from "@/components/theme";
import { useLiveData } from "@/lib/careHooks";
import { confirmAction } from "@/lib/confirm";
import {
  careErrorMessage,
  doctorPatients,
  doctorUnreadForPatient,
  endCare,
  getDietInstructions,
  getPatientProfile,
  listRecords,
  markPatientSeen,
  timeAgo,
  type DietInstructions,
  type DoctorPatientRow,
  type PatientProfile,
  type RecordSummary,
} from "@/lib/care";

type Tab = "records" | "diet" | "messages";
const CONDITIONS: Array<[string, string]> = [
  ["has_gestational_diabetes", "Gestational diabetes"],
  ["has_anemia", "Anaemia"],
  ["has_morning_sickness", "Morning sickness"],
  ["has_heartburn", "Heartburn"],
  ["has_constipation", "Constipation"],
];

export default function DoctorPatientScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const patientId = params.id;
  const [tab, setTab] = useState<Tab>(params.tab === "messages" || params.tab === "diet" ? params.tab : "records");
  const [row, setRow] = useState<DoctorPatientRow | null | undefined>(undefined);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [records, setRecords] = useState<RecordSummary[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [diet, setDiet] = useState<DietInstructions | null>(null);
  const [dietLoaded, setDietLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const seen = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = (await doctorPatients()).find((x) => x.patient_id === patientId) ?? null;
      setRow(r);
      if (!r || r.status !== "active") return;
      const [p, recs, u, d] = await Promise.all([
        getPatientProfile(patientId),
        listRecords(patientId),
        doctorUnreadForPatient(patientId),
        getDietInstructions(patientId),
      ]);
      setProfile(p);
      setRecords(recs);
      setUnread(u);
      setDiet(d);
      setDietLoaded(true);
      setError(null);
      if (r.is_new && !seen.current) {
        seen.current = true;
        void markPatientSeen(r.link_id);
      }
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load this patient."));
    }
  }, [patientId]);
  useLiveData(load, 20_000);

  async function end() {
    if (!row) return;
    if (!(await confirmAction("End care?", `You'll lose access to ${row.patient_name}'s records. She can choose another doctor.`, "End care"))) return;
    setEnding(true);
    try {
      await endCare(row.link_id, null);
      router.back();
    } catch (e) {
      setError(careErrorMessage(e));
      setEnding(false);
    }
  }

  if (row === undefined && !error) {
    return (
      <Screen>
        <ActivityIndicator color={t.info} />
      </Screen>
    );
  }
  if (!row || row.status !== "active") {
    return (
      <Screen>
        <Stack.Screen options={{ title: row?.patient_name ?? "Patient" }} />
        {error ? (
          <ErrorBox message={error} />
        ) : (
          <InfoBox>
            {row
              ? `${row.patient_name} is no longer connected to you${row.ended_at ? ` (since ${new Date(row.ended_at).toLocaleDateString()})` : ""}. Her records aren't shared with you any more.`
              : "This patient isn't connected to you."}
          </InfoBox>
        )}
      </Screen>
    );
  }

  const info = (profile?.info ?? {}) as Record<string, unknown>;
  const conditions = CONDITIONS.filter(([k]) => info[k]).map(([, l]) => l);
  const month = profile?.pregnancy_month ?? row.pregnancy_month;
  const recordUnread = Object.entries(unread).filter(([k]) => k !== "general").reduce((n, [, v]) => n + v, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: row.patient_name }} />
      <Card>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Avatar name={row.patient_name} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontSize: 18 }}>{profile?.full_name ?? row.patient_name}</Text>
            <Text style={{ color: t.muted }}>
              {month ? `Month ${month} of pregnancy` : "Month not set"}
              {typeof info.age === "number" ? ` · ${info.age} years` : ""} · connected {timeAgo(row.started_at)}
            </Text>
          </View>
        </View>
        {conditions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {conditions.map((c) => <Pill key={c} tone="amber">{c}</Pill>)}
          </View>
        ) : null}
        {row.patient_note ? <Text style={{ color: t.text, fontStyle: "italic" }}>“{row.patient_note}”</Text> : null}
      </Card>

      <Chips
        options={[
          { value: "records" as const, label: `Records${recordUnread ? ` (${recordUnread} new)` : ""}` },
          { value: "diet" as const, label: "Diet" },
          { value: "messages" as const, label: `Messages${unread.general ? ` (${unread.general})` : ""}` },
        ]}
        selected={[tab]}
        onToggle={setTab}
      />
      <ErrorBox message={error} />

      {tab === "records" ? (
        records === null ? (
          <ActivityIndicator color={t.info} />
        ) : records.length ? (
          records.map((r) => (
            <RecordRow key={r.id} record={r} doctorView unread={unread[r.id] ?? 0} href={{ pathname: "/doctor/record/[id]", params: { id: r.id } }} />
          ))
        ) : (
          <InfoBox>No records yet. Records the patient saves appear here automatically.</InfoBox>
        )
      ) : null}

      {tab === "diet" ? (
        dietLoaded ? <DietInstructionsEditor patientId={patientId} current={diet} onSaved={setDiet} /> : <ActivityIndicator color={t.info} />
      ) : null}

      {tab === "messages" ? (
        <Card>
          <SectionLabel>Conversation</SectionLabel>
          <Thread patientId={patientId} canWrite doctorAccent placeholder={`Message ${row.patient_name.split(" ")[0]}…`} emptyText="No messages yet." />
        </Card>
      ) : null}

      <Body muted>You see this patient’s records while she stays connected to you.</Body>
      <Button title="End care" variant="danger" onPress={end} loading={ending} />
    </Screen>
  );
}
