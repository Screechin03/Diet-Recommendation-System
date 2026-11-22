import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Recipe } from "@/lib/types";
import { recipeImage } from "@/lib/api";
import { elevation, useTheme } from "./theme";
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
    <View style={[styles.card, elevation(t), { backgroundColor: t.card, borderColor: t.hairline }]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors onError={() => setImage(null)} />
      ) : (
        <View style={[styles.image, styles.placeholder, { backgroundColor: t.primarySoft }]}>
          <Ionicons name="restaurant-outline" size={36} color={t.primary} />
        </View>
      )}
      {total ? (
        <View style={styles.timeBadge}>
          <Ionicons name="time-outline" size={13} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{total}</Text>
        </View>
      ) : null}

      <View style={styles.content}>
        <Text style={[styles.title, { color: t.text }]}>{recipe.Name}</Text>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {[
            ["flame-outline", `${fmt(recipe.Calories)} kcal`],
            ["barbell-outline", `${fmt(recipe.ProteinContent, 1)} g protein`],
            ["leaf-outline", `${fmt(recipe.FiberContent, 1)} g fibre`],
          ].map(([icon, label]) => (
            <View key={label} style={[styles.macro, { backgroundColor: t.muted2 }]}>
              <Ionicons name={icon as "flame-outline"} size={13} color={t.primary} />
              <Text style={{ color: t.text, fontSize: 12.5, fontWeight: "600" }}>{label}</Text>
            </View>
          ))}
        </View>

        {recipe.pregnancy_benefits?.length ? (
          <View style={[styles.benefits, { backgroundColor: t.successSoft }]}>
            <Text style={{ color: t.success, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}>GOOD FOR YOU NOW</Text>
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
                <View key={k} style={[styles.cell, { backgroundColor: t.muted2 }]}>
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
                <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                  <View style={[styles.stepNo, { backgroundColor: t.primarySoft }]}>
                    <Text style={{ color: t.primaryDeep, fontSize: 12, fontWeight: "800" }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: t.text, lineHeight: 21, flex: 1 }}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {onSave ? (
          <Button
            title={saved ? "Saved" : "Save recipe"}
            icon={saved ? "heart" : "heart-outline"}
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
  card: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  image: { width: "100%", height: 190 },
  timeBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(20,14,17,0.6)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  macro: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  stepNo: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  benefits: { borderRadius: 16, padding: 12, gap: 8 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, width: "47%" },
  sub: { fontWeight: "700", fontSize: 15 },
});
