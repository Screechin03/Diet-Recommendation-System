import { useState } from "react";
import { router } from "expo-router";
import { Body, Button, ErrorBox, Field, Screen } from "@/components/ui";
import { requireSupabase } from "@/lib/supabase";

export default function LoginScreen() {
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
      router.back();
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
    </Screen>
  );
}
