import { Redirect, Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";
import { useCareBadge } from "@/lib/careHooks";

type IconName = ComponentProps<typeof Ionicons>["name"];

const TABS: Array<{ name: string; title: string; icon: IconName }> = [
  { name: "index", title: "Home", icon: "heart-outline" },
  { name: "planner", title: "Diet Plan", icon: "nutrition-outline" },
  { name: "health", title: "Health", icon: "pulse-outline" },
  { name: "report", title: "Reports", icon: "document-text-outline" },
  { name: "account", title: "My care", icon: "medkit-outline" },
];

export default function TabLayout() {
  const t = useTheme();
  const { role } = useAuth();
  const badge = useCareBadge();
  // Doctors have their own tabs (inbox, patients, profile).
  if (role === "doctor") return <Redirect href="/inbox" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.card },
        headerTitleStyle: { color: t.text },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarBadge: tab.name === "account" && badge ? badge : undefined,
            tabBarIcon: ({ color, size }) => <Ionicons name={tab.icon} size={size} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
