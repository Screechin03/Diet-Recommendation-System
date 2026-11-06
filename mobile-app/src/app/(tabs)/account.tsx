import { ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Body, Button, Card, Disclaimer, H1, InfoBox, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function AccountScreen() {
  const { user, loading, enabled, signOut } = useAuth();

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!enabled) {
    return (
      <Screen>
        <InfoBox>Accounts aren’t configured in this build (missing Supabase settings).</InfoBox>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <H1>Your account</H1>
        <Body muted>Log in to save recipes and see your recommendation history. Uses the same account as the website.</Body>
        <Button title="Log in" onPress={() => router.push("/login")} />
        <Button title="Create account" variant="secondary" onPress={() => router.push("/signup")} />
        <Disclaimer />
      </Screen>
    );
  }

  const name = (user.user_metadata?.full_name as string | undefined) ?? null;
  return (
    <Screen>
      <Card>
        <H1>{name ?? "Your account"}</H1>
        <Body muted>{user.email}</Body>
      </Card>
      <Button title="Saved recipes" variant="secondary" onPress={() => router.push("/saved")} />
      <Button title="Recommendation history" variant="secondary" onPress={() => router.push("/history")} />
      <Button title="Log out" variant="danger" onPress={() => signOut().catch(() => {})} />
      <Disclaimer />
    </Screen>
  );
}
