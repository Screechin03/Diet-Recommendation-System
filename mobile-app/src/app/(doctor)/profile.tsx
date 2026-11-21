import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { Body, Button, Card, ErrorBox, Field, Screen, SectionLabel, ToggleRow } from "@/components/ui";
import { Avatar } from "@/components/Care";
import { useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { careErrorMessage, doctorName, updateDoctorProfile } from "@/lib/care";

export default function DoctorProfileScreen() {
  const t = useTheme();
  const { user, account, refreshAccount, signOut } = useAuth();
  const d = account?.doctor;
  const [form, setForm] = useState({
    full_name: d?.full_name ?? "",
    specialty: d?.specialty ?? "",
    hospital: d?.hospital ?? "",
    city: d?.city ?? "",
    bio: d?.bio ?? "",
    accepting_patients: d?.accepting_patients ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!d || !user) return null;

  const set = (k: "full_name" | "specialty" | "hospital" | "city" | "bio") => (v: string) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function save() {
    if (!form.full_name.trim()) {
      setError("Your name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateDoctorProfile(d!.id, {
        full_name: form.full_name.trim(),
        specialty: form.specialty.trim() || "Obstetrics & Gynaecology",
        hospital: form.hospital.trim() || null,
        city: form.city.trim() || null,
        bio: form.bio.trim() || null,
        accepting_patients: form.accepting_patients,
      });
      await refreshAccount();
      setSaved(true);
    } catch (e) {
      setError(careErrorMessage(e, "Couldn't save your profile."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Avatar name={form.full_name} size={52} doctor />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "800", fontSize: 18 }}>{doctorName(form.full_name)}</Text>
            <Text style={{ color: t.muted }}>{[form.specialty, form.hospital, form.city].filter((v) => v.trim()).join(" · ")}</Text>
          </View>
        </View>
        <Body muted>This is how patients see you when they choose their doctor.</Body>
      </Card>
      <Card>
        <SectionLabel>Public profile</SectionLabel>
        <Field label="Full name" value={form.full_name} onChangeText={set("full_name")} maxLength={120} />
        <Field label="Speciality" value={form.specialty} onChangeText={set("specialty")} maxLength={120} />
        <Field label="Hospital or clinic" value={form.hospital} onChangeText={set("hospital")} maxLength={160} />
        <Field label="City" value={form.city} onChangeText={set("city")} maxLength={80} />
        <Field label="About you" value={form.bio} onChangeText={set("bio")} multiline maxLength={1000} hint="Experience, languages, visiting hours" />
        <ToggleRow
          label="Accepting new patients"
          hint="When off, new patients can't choose you. Current patients stay connected."
          value={form.accepting_patients}
          onChange={(v) => {
            setSaved(false);
            setForm((f) => ({ ...f, accepting_patients: v }));
          }}
        />
        <ErrorBox message={error} />
        {saved ? <Text style={{ color: t.success }}>Saved</Text> : null}
        <Button title="Save profile" onPress={save} loading={busy} />
      </Card>
      <Card>
        <SectionLabel>Account</SectionLabel>
        <Body muted>{user.email}</Body>
        <Button
          title="Log out"
          variant="danger"
          onPress={() =>
            signOut()
              .catch(() => {})
              .finally(() => router.replace("/"))
          }
        />
      </Card>
    </Screen>
  );
}
