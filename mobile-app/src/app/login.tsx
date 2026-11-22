import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { AuthHeader, Button, Card, ErrorBox, Field, PasswordField, Screen } from "@/components/ui";
import { requireSupabase } from "@/lib/supabase";
import { useTheme } from "@/components/theme";

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
      // No navigation needed: the root layout switches to the app as soon as the session exists.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen safeTop>
      <AuthHeader title="Welcome back" subtitle="Your pregnancy meals, medicine checks and doctor, in one calm place." />
      <Card style={{ gap: 16 }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
        <PasswordField label="Password" value={password} onChangeText={setPassword} autoComplete="password" textContentType="password" onSubmitEditing={() => email && password && !loading && submit()} returnKeyType="go" />
        <ErrorBox message={error} />
        <Button title="Log in" onPress={submit} loading={loading} disabled={!email || !password} />
      </Card>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
        <Text style={{ color: t.muted, fontSize: 15 }}>New to MamaCare?</Text>
        <Pressable onPress={() => router.push("/signup")} accessibilityRole="link" hitSlop={8}>
          <Text style={{ color: t.primary, fontWeight: "800", fontSize: 15 }}>Create an account</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
        <Text style={{ color: t.subtle, fontSize: 12, fontWeight: "700" }}>OR</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      </View>
      <Pressable
        onPress={() => router.push("/doctor-login")}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 14,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: pressed ? t.infoSoft : t.card,
        })}
      >
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: t.infoSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="medical" size={20} color={t.info} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>I’m a doctor</Text>
          <Text style={{ color: t.muted, fontSize: 13 }}>Review your patients’ reports and plans</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.subtle} />
      </Pressable>
    </Screen>
  );
}
