import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { Body, Button, Chips, ErrorBox, Field, InfoBox, Screen } from "@/components/ui";
import { useTheme } from "@/components/theme";
import { careErrorMessage, signUpDoctor } from "@/lib/care";

const SPECIALTIES = ["Obstetrics & Gynaecology", "General Practice", "Maternal-Fetal Medicine", "Nutrition & Dietetics", "Midwifery"].map((s) => ({ value: s, label: s }));

export default function DoctorSignupScreen() {
  const t = useTheme();
  const [form, setForm] = useState({ fullName: "", specialty: SPECIALTIES[0].value, hospital: "", city: "", email: "", password: "", code: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      // With a session the root layout opens the doctor's inbox by itself.
      if (!(await signUpDoctor(form))) setDone(true); // email confirmation is on in Supabase
    } catch (e) {
      setError(careErrorMessage(e, "Sign-up failed."));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <InfoBox>Your doctor account was created. Open the confirmation link we emailed you, then log in.</InfoBox>
        <Button title="Go to doctor login" onPress={() => router.replace("/doctor-login")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: t.info, fontWeight: "800", letterSpacing: 1.6, fontSize: 11 }}>MAMACARE FOR DOCTORS</Text>
        <Body muted>Patients find you by name, hospital and city when they choose their doctor.</Body>
      </View>
      <Field label="Full name" value={form.fullName} onChangeText={set("fullName")} autoComplete="name" textContentType="name" maxLength={120} />
      <Body>Speciality</Body>
      <Chips options={SPECIALTIES} selected={[form.specialty]} onToggle={(v) => set("specialty")(v)} />
      <Field label="Hospital or clinic" value={form.hospital} onChangeText={set("hospital")} maxLength={160} />
      <Field label="City" value={form.city} onChangeText={set("city")} maxLength={80} />
      <Field label="Email" value={form.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={form.password} onChangeText={set("password")} secureTextEntry hint="At least 6 characters" autoComplete="new-password" textContentType="newPassword" />
      <Field label="Doctor access code" value={form.code} onChangeText={set("code")} autoCapitalize="none" autoCorrect={false} hint="Given to you by the MamaCare team" />
      <ErrorBox message={error} />
      <Button
        title="Create doctor account"
        onPress={submit}
        loading={loading}
        disabled={!form.fullName.trim() || !form.email || form.password.length < 6 || !form.code.trim()}
      />
    </Screen>
  );
}
