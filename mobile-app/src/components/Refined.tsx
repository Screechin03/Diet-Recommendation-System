import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { RefinedSummary } from "@/lib/types";
import { useTheme } from "./theme";
import { Body, Bullets, Card } from "./ui";

/** Gemini plain-language summary (from /api/refine). */
export function Refined({ refined }: { refined: RefinedSummary | null }) {
  const t = useTheme();
  if (!refined) return null;
  return (
    <Card style={{ backgroundColor: t.primarySoft, borderColor: t.primarySoft }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Ionicons name="sparkles" size={18} color={t.primary} />
        <Text style={{ color: t.text, fontWeight: "700", fontSize: 16, flex: 1 }}>{refined.title ?? "AI summary"}</Text>
      </View>
      {refined.summary ? <Body>{refined.summary}</Body> : null}
      <Bullets items={Array.isArray(refined.bullets) ? refined.bullets : undefined} />
    </Card>
  );
}
