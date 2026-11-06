import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Recipe } from "@/lib/types";
import { recipeImage } from "@/lib/api";
import { useTheme } from "./theme";
import { Bullets, Button } from "./ui";

function fmt(n: unknown, digits = 0): string {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(digits) : "–";
}

/** Food.com times are ISO-8601 durations like "PT1H30M". */
function fmtDuration(value: unknown): string | null {
  const s = String(value ?? "");
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  return [m[1] ? `${m[1]} h` : "", m[2] ? `${m[2]} min` : ""].filter(Boolean).join(" ");
}

export function RecipeCard({
  recipe,
  onSave,
  saving,
  saved,
  onRemove,
}: {
  recipe: Recipe;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
  onRemove?: () => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const total = fmtDuration(recipe.TotalTime);

  useEffect(() => {
    let cancelled = false;
    recipeImage(recipe.Name, recipe.RecipeIngredientParts ?? []).then((url) => {
      if (!cancelled) setImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [recipe.Name, recipe.RecipeIngredientParts]);

  const nutrients: Array<[string, string]> = [
    ["Calories", fmt(recipe.Calories)],
    ["Protein", `${fmt(recipe.ProteinContent, 1)} g`],
    ["Carbs", `${fmt(recipe.CarbohydrateContent, 1)} g`],
    ["Fat", `${fmt(recipe.FatContent, 1)} g`],
    ["Fiber", `${fmt(recipe.FiberContent, 1)} g`],
    ["Sugar", `${fmt(recipe.SugarContent, 1)} g`],
    ["Sodium", `${fmt(recipe.SodiumContent)} mg`],
    ["Cholest.", `${fmt(recipe.CholesterolContent)} mg`],
  ];

  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors onError={() => setImage(null)} />
      ) : (
        <View style={[styles.image, styles.placeholder, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="restaurant-outline" size={36} color={t.primary} />
        </View>
      )}

      <View style={styles.content}>
        <Text style={[styles.title, { color: t.text }]}>{recipe.Name}</Text>
        <Text style={{ color: t.muted }}>
          {fmt(recipe.Calories)} kcal · {fmt(recipe.ProteinContent, 1)} g protein{total ? ` · ${total}` : ""}
        </Text>

        {recipe.pregnancy_benefits?.length ? (
          <View style={[styles.benefits, { backgroundColor: t.successSoft }]}>
            <Bullets items={recipe.pregnancy_benefits} color={t.success} />
          </View>
        ) : null}

        <Pressable onPress={() => setOpen((v) => !v)} style={styles.toggle} accessibilityRole="button">
          <Text style={{ color: t.primary, fontWeight: "600" }}>{open ? "Hide details" : "Nutrition, ingredients & steps"}</Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={t.primary} />
        </Pressable>

        {open ? (
          <View style={{ gap: 14 }}>
            <View style={styles.grid}>
              {nutrients.map(([k, v]) => (
                <View key={k} style={[styles.cell, { borderColor: t.border }]}>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{k}</Text>
                  <Text style={{ color: t.text, fontWeight: "600" }}>{v}</Text>
                </View>
              ))}
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[styles.sub, { color: t.text }]}>Ingredients</Text>
              <Bullets items={recipe.RecipeIngredientParts} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[styles.sub, { color: t.text }]}>Steps</Text>
              {(recipe.RecipeInstructions ?? []).map((step, i) => (
                <Text key={i} style={{ color: t.text, lineHeight: 21 }}>
                  {i + 1}. {step}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {onSave ? (
          <Button
            title={saved ? "Saved ✓" : "Save recipe"}
            variant="secondary"
            onPress={onSave}
            loading={saving}
            disabled={saved}
          />
        ) : null}
        {onRemove ? <Button title="Remove" variant="danger" onPress={onRemove} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  image: { width: "100%", height: 170 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  content: { padding: 14, gap: 10 },
  title: { fontSize: 17, fontWeight: "700" },
  benefits: { borderRadius: 10, padding: 10 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { borderWidth: 1, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, width: "47%" },
  sub: { fontWeight: "700", fontSize: 15 },
});
