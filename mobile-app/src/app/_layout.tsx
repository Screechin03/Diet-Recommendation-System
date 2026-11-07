import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth";
import { useTheme } from "@/components/theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.primary,
          headerTitleStyle: { color: t.text },
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Log in", presentation: "modal" }} />
        <Stack.Screen name="signup" options={{ title: "Create account", presentation: "modal" }} />
        <Stack.Screen name="saved" options={{ title: "Saved recipes" }} />
        <Stack.Screen name="history" options={{ title: "Recommendation history" }} />
        <Stack.Screen name="vitals" options={{ title: "Vital signs" }} />
      </Stack>
    </AuthProvider>
  );
}
