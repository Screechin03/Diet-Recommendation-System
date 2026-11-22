import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Body, Button, Card, ErrorBox, InfoBox, Screen, SearchField } from "@/components/ui";
import { Avatar, Pill } from "@/components/Care";
import { useTheme } from "@/components/theme";
import { useCareLinks } from "@/lib/careHooks";
import { assignDoctor, careErrorMessage, doctorName, listDoctors, type DoctorProfile } from "@/lib/care";

export default function ChooseDoctorScreen() {
  const t = useTheme();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { active } = useCareLinks();
  const [doctors, setDoctors] = useState<DoctorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listDoctors()
      .then(setDoctors)
      .catch((e) => setError(careErrorMessage(e, "Couldn't load the doctor list.")));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (doctors ?? [])
      .filter((d) => !q || [d.full_name, d.specialty, d.hospital, d.city].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.id === active?.doctor_id) - Number(a.id === active?.doctor_id) || Number(b.accepting_patients) - Number(a.accepting_patients));
  }, [doctors, query, active]);

  async function connect(d: DoctorProfile) {
    setBusy(true);
    setError(null);
    try {
      await assignDoctor(d.id, note.trim() || null);
      const target = typeof next === "string" && next.startsWith("/care/") ? next : "/account";
      router.replace(target as Href);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't connect. Please try again."));
      setBusy(false);
    }
  }

  const current = active?.doctor ?? null;
  return (
    <Screen>
      <Body muted>
        You’re connected as soon as you choose. Your doctor can then see your saved records, review them, send diet instructions and message you.
        {current ? ` ${doctorName(current.full_name)} will stop seeing your records when you switch.` : ""}
      </Body>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search name, hospital or city" />
      <ErrorBox message={error} />
      {doctors === null && !error ? <ActivityIndicator color={t.primary} /> : null}
      {doctors && !shown.length ? <InfoBox>{doctors.length ? "No doctors match your search." : "No doctors have joined yet."}</InfoBox> : null}
      {shown.map((d) => {
        const isCurrent = d.id === active?.doctor_id;
        const open = selected === d.id;
        return (
          <Card key={d.id}>
            <Pressable
              disabled={isCurrent || !d.accepting_patients}
              onPress={() => {
                setSelected(open ? null : d.id);
                setNote("");
              }}
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
              accessibilityRole="button"
            >
              <Avatar name={d.full_name} size={48} doctor />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.text, fontWeight: "800", fontSize: 16 }}>{doctorName(d.full_name)}</Text>
                <Text style={{ color: t.muted }}>{[d.specialty, d.hospital, d.city].filter(Boolean).join(" · ")}</Text>
                {isCurrent ? <Pill tone="green">Your doctor</Pill> : !d.accepting_patients ? <Pill>Not taking new patients</Pill> : null}
              </View>
            </Pressable>
            {d.bio ? <Text style={{ color: t.muted, lineHeight: 20 }} numberOfLines={open ? undefined : 2}>{d.bio}</Text> : null}
            {open ? (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={1000}
                  placeholder={`Anything ${doctorName(d.full_name)} should know? (optional)`}
                  placeholderTextColor={t.muted}
                  style={[st.note, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
                />
                {current ? <InfoBox>{doctorName(current.full_name)} will no longer see your records or message you.</InfoBox> : null}
                <Button title={`Connect with ${doctorName(d.full_name)}`} onPress={() => connect(d)} loading={busy} />
              </View>
            ) : !isCurrent && d.accepting_patients ? (
              <Button title={current ? "Switch to this doctor" : "Choose"} variant="secondary" onPress={() => setSelected(d.id)} />
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

const st = StyleSheet.create({
  search: { borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 12, fontSize: 16 },
  note: { borderWidth: 1, borderRadius: 12, minHeight: 80, paddingHorizontal: 12, paddingTop: 12, fontSize: 15, textAlignVertical: "top" },
});
