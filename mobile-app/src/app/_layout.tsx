import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useTheme } from "@/components/theme";

/**
 * Login is required: logged-out users only see Log in / Create account, logged-in users only see the app.
 * Logging in switches to the Home tab, logging out returns to Log in (Stack.Protected handles both).
 * If accounts aren't configured (no Supabase env vars), the app stays open instead of locking everyone out.
 */
function RootNavigator() {
  const t = useTheme();
  const { user, loading, enabled } = useAuth();
  const signedIn = Boolean(user) || !enabled;

  if (loading) {
    // Checking the saved session; don't flash the login screen at users who are already logged in.
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.primary} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.primary,
        headerTitleStyle: { color: t.text },
        contentStyle: { backgroundColor: t.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="saved" options={{ title: "Saved recipes" }} />
        <Stack.Screen name="history" options={{ title: "Recommendation history" }} />
        <Stack.Screen name="vitals" options={{ title: "Vital signs" }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ title: "Log in", headerBackVisible: false }} />
        <Stack.Screen name="signup" options={{ title: "Create account" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider>
  );
}
