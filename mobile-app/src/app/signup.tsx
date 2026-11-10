import { useState } from "react";
import { router } from "expo-router";
import { Body, Button, ErrorBox, Field, InfoBox, PasswordField, Screen } from "@/components/ui";
import { apiBaseUrl } from "@/lib/api";
import { requireSupabase } from "@/lib/supabase";

/** The website's "email verified, please log in" page; falls back to the Supabase Site URL if unset. */
function emailVerifiedUrl(): string | undefined {
  try {
    return `${apiBaseUrl()}/email-verified`;
  } catch {
    return undefined;
  }
}

function backToLogin() {
  if (router.canGoBack()) router.back();
  else router.replace("/login");
}

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
        options: { data: { full_name: fullName.trim() || null }, emailRedirectTo: emailVerifiedUrl() },
      });
      if (err) throw err;
      // With a session (email confirmation off) the root layout opens the app by itself.
      if (!data.session) setDone(true); // email confirmation is enabled in Supabase
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <InfoBox>
          Account created. We sent a confirmation link to {email.trim()}. Open it to verify your email, then come back
          and log in.
        </InfoBox>
        <Button title="Go to log in" onPress={backToLogin} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <PasswordField label="Password" value={password} onChangeText={setPassword} hint="At least 6 characters" autoComplete="new-password" textContentType="newPassword" />
      <ErrorBox message={error} />
      <Button title="Create account" onPress={submit} loading={loading} disabled={!email || password.length < 6} />
      <Body muted>Already have an account?</Body>
      <Button title="Log in" variant="secondary" onPress={backToLogin} />
    </Screen>
  );
}
