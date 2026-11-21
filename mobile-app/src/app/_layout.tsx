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
        <Stack.Screen name="(doctor)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Log in", presentation: "modal" }} />
        <Stack.Screen name="signup" options={{ title: "Create account", presentation: "modal" }} />
        <Stack.Screen name="saved" options={{ title: "Saved recipes" }} />
        <Stack.Screen name="history" options={{ title: "Recommendation history" }} />
        <Stack.Screen name="vitals" options={{ title: "Vital signs" }} />
        <Stack.Screen name="doctor-login" options={{ title: "Doctor login", presentation: "modal" }} />
        <Stack.Screen name="doctor-signup" options={{ title: "Doctor account", presentation: "modal" }} />
        <Stack.Screen name="care/doctors" options={{ title: "Choose your doctor" }} />
        <Stack.Screen name="care/record/[id]" options={{ title: "Record" }} />
        <Stack.Screen name="care/messages" options={{ title: "Messages" }} />
        <Stack.Screen name="doctor/patient/[id]" options={{ title: "Patient" }} />
        <Stack.Screen name="doctor/record/[id]" options={{ title: "Record" }} />
      </Stack>
    </AuthProvider>
  );
}
