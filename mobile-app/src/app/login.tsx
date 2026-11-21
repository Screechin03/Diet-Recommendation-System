import { useState } from "react";
import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { Body, Button, ErrorBox, Field, Screen } from "@/components/ui";
import { requireSupabase } from "@/lib/supabase";
import { useTheme } from "@/components/theme";
import { getAccount } from "@/lib/care";

export default function LoginScreen() {
  const t = useTheme();
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
      let doctor = false;
      try {
        doctor = (await getAccount()).role === "doctor";
      } catch {
        // doctor features not installed: patient
      }
      if (doctor) {
        if (router.canDismiss()) router.dismissAll();
        router.replace("/inbox");
      } else {
        router.back();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" />
      <ErrorBox message={error} />
      <Button title="Log in" onPress={submit} loading={loading} disabled={!email || !password} />
      <Body muted>No account yet?</Body>
      <Button title="Create account" variant="secondary" onPress={() => router.replace("/signup")} />
      <Pressable onPress={() => router.replace("/doctor-login")} accessibilityRole="link" style={{ alignSelf: "center", padding: 8 }}>
        <Text style={{ color: t.info, fontWeight: "700" }}>Are you a doctor? Doctor login</Text>
      </Pressable>
    </Screen>
  );
}
