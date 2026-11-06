import { useState } from "react";
import { router } from "expo-router";
import { Button, ErrorBox, Field, InfoBox, Screen } from "@/components/ui";
import { requireSupabase } from "@/lib/supabase";

export default function SignupScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      // The DB trigger handle_new_user_profile() fills user_profiles from this metadata.
      const { data, error: err } = await requireSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() || null } },
      });
      if (err) throw err;
      if (data.session) router.back();
      else setDone(true); // email confirmation is enabled in Supabase
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <InfoBox>Account created. Check your email to confirm it, then log in.</InfoBox>
        <Button title="Go to log in" onPress={() => router.replace("/login")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 6 characters" autoComplete="new-password" textContentType="newPassword" />
      <ErrorBox message={error} />
      <Button title="Create account" onPress={submit} loading={loading} disabled={!email || password.length < 6} />
    </Screen>
  );
}
