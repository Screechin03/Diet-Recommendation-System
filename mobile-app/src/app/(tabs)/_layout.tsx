import { Redirect, Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { elevation, useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { useCareBadge } from "@/lib/careHooks";

type IconName = ComponentProps<typeof Ionicons>["name"];

const TABS: Array<{ name: string; title: string; icon: IconName; active: IconName }> = [
  { name: "index", title: "Home", icon: "home-outline", active: "home" },
  { name: "planner", title: "Diet Plan", icon: "nutrition-outline", active: "nutrition" },
  { name: "health", title: "Health", icon: "pulse-outline", active: "pulse" },
  { name: "report", title: "Reports", icon: "document-text-outline", active: "document-text" },
  { name: "account", title: "My care", icon: "medkit-outline", active: "medkit" },
];

export default function TabLayout() {
  const t = useTheme();
  const { role } = useAuth();
  const badge = useCareBadge();
  const insets = useSafeAreaInsets();
  // Doctors have their own tabs (inbox, patients, profile).
  if (role === "doctor") return <Redirect href="/inbox" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.subtle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.1 },
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopWidth: 0,
          height: (Platform.OS === "web" ? 64 : 58) + insets.bottom,
          paddingTop: 6,
          ...elevation(t, 2),
        },
        tabBarBadgeStyle: { backgroundColor: t.primary, color: t.onPrimary, fontSize: 10, fontWeight: "800" },
        headerStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: t.text, fontWeight: "800", fontSize: 18 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerShown: tab.name !== "index",
            tabBarBadge: tab.name === "account" && badge ? badge : undefined,
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? tab.active : tab.icon} size={24} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
