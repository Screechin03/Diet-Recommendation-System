import { Text, View } from "react-native";
import { useTheme } from "./theme";
import { Bullets } from "./ui";

function humanize(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isEmpty(v: unknown): boolean {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every(isEmpty);
  return false;
}

function asLine(v: unknown): string {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  // e.g. medication {name, dose, frequency} → "name · dose · frequency"
  return Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => !isEmpty(x))
    .map(([k, x]) => (typeof x === "object" ? `${humanize(k)}: ${JSON.stringify(x)}` : String(x)))
    .join(" · ");
}

/**
 * Renders Gemini's structured JSON (prescription extraction / diet plan) as readable sections
 * instead of raw JSON. Works for any shape, so schema tweaks on the backend won't break the app.
 */
export function JsonSections({ data }: { data: Record<string, unknown> | null | undefined }) {
  const t = useTheme();
  if (!data) return null;
  return (
    <View style={{ gap: 14 }}>
      {Object.entries(data)
        .filter(([, v]) => !isEmpty(v))
        .map(([key, value]) => (
          <View key={key} style={{ gap: 6 }}>
            <Text style={{ color: t.text, fontWeight: "700", fontSize: 15 }}>{humanize(key)}</Text>
            {Array.isArray(value) ? (
              <Bullets items={value.map(asLine).filter(Boolean)} />
            ) : typeof value === "object" ? (
              <View style={{ gap: 4 }}>
                {Object.entries(value as Record<string, unknown>)
                  .filter(([, v]) => !isEmpty(v))
                  .map(([k, v]) => (
                    <Text key={k} style={{ color: t.text, lineHeight: 21 }}>
                      <Text style={{ color: t.muted }}>{humanize(k)}: </Text>
                      {asLine(v)}
                    </Text>
                  ))}
              </View>
            ) : (
              <Text style={{ color: t.text, lineHeight: 21 }}>{String(value)}</Text>
            )}
          </View>
        ))}
    </View>
  );
}
