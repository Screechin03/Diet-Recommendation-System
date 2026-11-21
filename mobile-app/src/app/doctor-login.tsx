import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Body, Button, ErrorBox, Field, Screen } from "@/components/ui";
import { useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { careErrorMessage, getAccount } from "@/lib/care";
import { requireSupabase } from "@/lib/supabase";

export default function DoctorLoginScreen() {
  const t = useTheme();
  const { refreshAccount } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      const account = await getAccount();
      await refreshAccount();
      // A patient who used this screen simply goes to the patient side.
      if (router.canDismiss()) router.dismissAll();
      router.replace(account.role === "doctor" ? "/inbox" : "/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(/Invalid login credentials/i.test(msg) ? "Wrong email or password." : careErrorMessage(e, "Login failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <Text style={{ color: t.info, fontWeight: "800", letterSpacing: 1.6, fontSize: 11 }}>MAMACARE FOR DOCTORS</Text>
        <Body muted>Sign in to see your patients’ records, reviews and messages.</Body>
      </View>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
      <ErrorBox message={error} />
      <Button title="Log in" onPress={submit} loading={loading} disabled={!email || !password} />
      <Pressable onPress={() => router.replace("/doctor-signup")} accessibilityRole="link" style={{ alignSelf: "center", padding: 8 }}>
        <Text style={{ color: t.info, fontWeight: "700" }}>New here? Create a doctor account</Text>
      </Pressable>
    </Screen>
  );
}
