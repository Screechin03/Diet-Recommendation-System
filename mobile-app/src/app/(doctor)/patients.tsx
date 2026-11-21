import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Chips, ErrorBox, InfoBox, Screen } from "@/components/ui";
import { Avatar, Pill } from "@/components/Care";
import { useTheme } from "@/components/theme";
import { useLiveData } from "@/lib/careHooks";
import { careErrorMessage, doctorPatients, timeAgo, type DoctorPatientRow } from "@/lib/care";

export default function DoctorPatientsScreen() {
  const t = useTheme();
  const [rows, setRows] = useState<DoctorPatientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "ended">("active");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await doctorPatients());
      setError(null);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't load your patients."));
    }
  }, []);
  useLiveData(load, 30_000);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => r.status === view && (!q || r.patient_name.toLowerCase().includes(q)));
  }, [rows, view, query]);
  const count = (s: "active" | "ended") => rows?.filter((r) => r.status === s).length ?? 0;

  return (
    <Screen>
      <Chips
        options={[{ value: "active" as const, label: `Current (${count("active")})` }, { value: "ended" as const, label: `Past (${count("ended")})` }]}
        selected={[view]}
        onToggle={setView}
      />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search patients"
        placeholderTextColor={t.muted}
        style={[st.search, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
      />
      <ErrorBox message={error} />
      {rows === null && !error ? <ActivityIndicator color={t.info} /> : null}
      {rows && !shown.length ? (
        <InfoBox>{query ? "No patients match your search." : view === "active" ? "No current patients yet. Patients choose you under My care → Find a doctor." : "No past patients."}</InfoBox>
      ) : null}
      {shown.map((p) => (
        <Pressable
          key={p.patient_id}
          onPress={() => router.push({ pathname: "/doctor/patient/[id]", params: { id: p.patient_id } })}
          accessibilityRole="button"
          style={({ pressed }) => [st.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Avatar name={p.patient_name} size={44} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{p.patient_name}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {p.status === "active"
                ? `${p.pregnancy_month ? `Month ${p.pregnancy_month}` : "Month not set"} · ${timeAgo(p.last_activity)}`
                : `Ended ${p.ended_at ? new Date(p.ended_at).toLocaleDateString() : ""}`}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {p.is_new ? <Pill tone="green">New</Pill> : null}
              {p.urgent_pending ? <Pill tone="red">{`${p.urgent_pending} urgent`}</Pill> : null}
              {p.pending_reviews - p.urgent_pending > 0 ? <Pill tone="blue">{`${p.pending_reviews - p.urgent_pending} to review`}</Pill> : null}
              {p.unread_messages ? <Pill tone="amber">{`${p.unread_messages} unread`}</Pill> : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.muted} />
        </Pressable>
      ))}
    </Screen>
  );
}

const st = StyleSheet.create({
  search: { borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 12, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
});
