import { ActivityIndicator, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { elevation, useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { useCareBadge } from "@/lib/careHooks";

/** The doctor's own tab bar. Anyone who isn't a signed-in doctor is sent to the patient app. */
export default function DoctorTabs() {
  const t = useTheme();
  const { user, role, roleLoading } = useAuth();
  const badge = useCareBadge();

  if (roleLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.info} />
      </View>
    );
  }
  if (!user || role !== "doctor") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.info,
        tabBarInactiveTintColor: t.subtle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: { backgroundColor: t.card, borderTopWidth: 0, ...elevation(t, 2) },
        headerStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: t.text, fontWeight: "800", fontSize: 18 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarBadge: badge || undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="file-tray-full-outline" size={size} color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{ title: "Patients", tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={String(color)} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={String(color)} /> }}
      />
    </Tabs>
  );
}
