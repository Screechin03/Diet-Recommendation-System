import { Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Body, Disclaimer, H1, Screen } from "@/components/ui";
import { useTheme } from "@/components/theme";
import { useAuth } from "@/lib/auth";

const FEATURES: Array<{ href: Href; icon: ComponentProps<typeof Ionicons>["name"]; title: string; text: string }> = [
  {
    href: "/planner",
    icon: "nutrition-outline",
    title: "Pregnancy diet plan",
    text: "Recipes matched to your trimester, health conditions and dietary needs.",
  },
  {
    href: "/health",
    icon: "pulse-outline",
    title: "Health risk check",
    text: "Enter your vitals and get an ML-based risk assessment with next steps.",
  },
  {
    href: "/report",
    icon: "document-text-outline",
    title: "Prescription reader",
    text: "Snap a photo of a prescription or lab report and get a clear summary plus diet guidance.",
  },
  {
    href: "/account",
    icon: "bookmark-outline",
    title: "Saved recipes & history",
    text: "Log in to keep favourite recipes and past recommendations, synced with the website.",
  },
];

export default function Home() {
  const t = useTheme();
  const { user } = useAuth();
  return (
    <Screen>
      <View style={{ gap: 8, paddingTop: 4 }}>
        <Text style={{ color: t.primary, fontWeight: "700", letterSpacing: 1, fontSize: 12 }}>MAMACARE</Text>
        <H1>{user ? "Welcome back" : "Healthy eating for you and your baby"}</H1>
        <Body muted>Personalised pregnancy nutrition, health checks and report reading in one place.</Body>
      </View>

      {FEATURES.map((f) => (
        <Pressable
          key={f.title}
          onPress={() => router.navigate(f.href)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: "row",
            gap: 14,
            alignItems: "center",
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.card,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: t.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={f.icon} size={24} color={t.primary} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{f.title}</Text>
            <Text style={{ color: t.muted, lineHeight: 20 }}>{f.text}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={t.muted} />
        </Pressable>
      ))}

      <Disclaimer />
    </Screen>
  );
}
