import { ActivityIndicator } from "react-native";
import { router, Stack } from "expo-router";
import { Button, Card, InfoBox, Screen } from "@/components/ui";
import { Thread } from "@/components/Care";
import { useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { useCareLinks } from "@/lib/careHooks";
import { doctorName } from "@/lib/care";

/** The patient's general conversation with her doctor (record comments live on each record). */
export default function MessagesScreen() {
  const t = useTheme();
  const { user } = useAuth();
  const { active, loading } = useCareLinks();
  if (!user || loading) {
    return (
      <Screen>
        <ActivityIndicator color={t.primary} />
      </Screen>
    );
  }
  const dr = active?.doctor ? doctorName(active.doctor.full_name) : null;
  return (
    <Screen>
      <Stack.Screen options={{ title: dr ?? "Messages" }} />
      {!dr ? (
        <>
          <InfoBox>Choose a doctor to send messages.</InfoBox>
          <Button title="Find a doctor" onPress={() => router.push("/care/doctors")} />
        </>
      ) : null}
      <Card>
        <Thread
          patientId={user.id}
          canWrite={Boolean(dr)}
          placeholder="Ask a question or share an update…"
          emptyText="No messages yet. Say hello or ask a question."
        />
      </Card>
    </Screen>
  );
}
