import { useState } from "react";
import { router } from "expo-router";
import { Body, Button, ErrorBox, Field, H1, PasswordField, Screen } from "@/components/ui";
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
      // No navigation needed: the root layout switches to the app as soon as the session exists.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <H1>Welcome to MamaCare</H1>
      <Body muted>Log in to get your pregnancy diet plan, health check and reports.</Body>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <PasswordField label="Password" value={password} onChangeText={setPassword} autoComplete="password" textContentType="password" onSubmitEditing={() => email && password && !loading && submit()} returnKeyType="go" />
      <ErrorBox message={error} />
      <Button title="Log in" onPress={submit} loading={loading} disabled={!email || !password} />
      <Body muted>No account yet?</Body>
      <Button title="Create account" variant="secondary" onPress={() => router.push("/signup")} />
    </Screen>
  );
}
