// Day plan: coverage rings for the day's targets, meals on a timeline, swap any meal, AI review summary.
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { elevation, type as typo, useTheme } from "./theme";
import { Bullets, Card, IconCircle, ProgressRing } from "./ui";
import {
  NUTRIENT_COPY,
  SLOT_LABEL,
  SLOT_ORDER,
  SLOT_TIME,
  applySwap,
  getSwaps,
  type Coverage,
  type MealPlan,
  type NutrientKey,
  type PlanDay,
  type PlanMeal,
  type SwapOption,
} from "@/lib/mealPlan";
import type { PregnancyInfo } from "@/lib/types";

const MIN_KEYS: NutrientKey[] = ["energy_kcal", "protein_g", "fiber_g", "iron_mg", "folate_ug", "calcium_mg"];
const MAX_KEYS: NutrientKey[] = ["sodium_mg", "satfat_g", "sugar_g", "carbs_g", "fiber_cap_g"];
const fmt = (n: number | undefined, d = 0) => (n == null || !Number.isFinite(n) ? "–" : n.toFixed(d));

function Rings({ day }: { day: PlanDay }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 14 }}>
      {MIN_KEYS.map((k) => {
        const c = day.coverage[k];
        if (!c) return null;
        const color = c.met ? t.success : c.pct >= 70 ? t.warn : t.danger;
        return (
          <View key={k} style={{ width: "33.33%", alignItems: "center", gap: 4 }}>
            <ProgressRing value={Math.min(c.pct, 100) / 100} size={64} stroke={6} color={color} track={t.muted2}>
              <Text style={{ color: t.text, fontWeight: "800", fontSize: 13 }}>{c.pct}%</Text>
            </ProgressRing>
            <Text style={{ color: t.text, fontSize: 12, fontWeight: "700" }}>
              {NUTRIENT_COPY[k].label}
              {NUTRIENT_COPY[k].estimated ? <Text style={{ color: t.subtle }}>*</Text> : null}
            </Text>
            <Text style={{ color: t.muted, fontSize: 11 }}>
              {fmt(c.value)} / {fmt(c.target)} {NUTRIENT_COPY[k].unit}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function LimitBar({ c, k }: { c: Coverage; k: NutrientKey }) {
  const t = useTheme();
  const pct = Math.min(c.pct, 130) / 130;
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: t.text, fontSize: 12.5, fontWeight: "700" }}>{NUTRIENT_COPY[k].label}</Text>
        <Text style={{ color: c.met ? t.muted : t.danger, fontSize: 12, fontWeight: c.met ? "500" : "700" }}>
          {fmt(c.value)} of max {fmt(c.target)} {NUTRIENT_COPY[k].unit}
        </Text>
      </View>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: t.muted2, overflow: "hidden" }}>
        <View style={{ width: `${pct * 100}%`, height: 7, borderRadius: 4, backgroundColor: c.met ? t.success : t.danger }} />
        <View style={{ position: "absolute", left: `${(100 / 130) * 100}%`, top: 0, bottom: 0, width: 1.5, backgroundColor: t.subtle }} />
      </View>
    </View>
  );
}

export function CoverageCard({ day }: { day: PlanDay }) {
  const t = useTheme();
  const all = day.targets_met === day.targets_total;
  return (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[typo.eyebrow, { color: t.muted, flex: 1 }]}>Day {day.day} · how it adds up</Text>
        <View style={{ backgroundColor: all ? t.successSoft : t.warnSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: all ? t.success : t.warn, fontWeight: "800", fontSize: 12 }}>
            {day.targets_met}/{day.targets_total} targets
          </Text>
        </View>
      </View>
      <Rings day={day} />
      <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: t.hairline, paddingTop: 14 }}>
        {MAX_KEYS.map((k) => (day.coverage[k] ? <LimitBar key={k} c={day.coverage[k]!} k={k} /> : null))}
      </View>
      <Text style={{ color: t.subtle, fontSize: 11.5 }}>* Estimated from the ingredients. Energy counts as met within 10%.</Text>
    </Card>
  );
}

function MealCard({ meal, onSwap, busy }: { meal: PlanMeal; onSwap?: () => void; busy?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const r = meal.recipe;
  return (
    <View style={[st.meal, elevation(t), { backgroundColor: t.card, borderColor: t.hairline }]}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <Text style={[typo.headline, { color: t.text, flex: 1, fontSize: 16 }]}>{r.Name}</Text>
        {onSwap ? (
          <Pressable onPress={onSwap} disabled={busy} accessibilityRole="button" accessibilityLabel={`Swap ${meal.label}`} style={[st.swap, { borderColor: t.border }]}>
            {busy ? <ActivityIndicator size="small" color={t.primary} /> : <Ionicons name="swap-horizontal" size={16} color={t.primary} />}
            <Text style={{ color: t.primary, fontWeight: "700", fontSize: 12.5 }}>Swap</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip text={`${fmt(r.Calories)} kcal`} strong />
        <Chip text={`${fmt(r.ProteinContent, 1)} g protein`} />
        <Chip text={`iron ${fmt(r.estimated.iron_mg, 1)} mg*`} tint />
        <Chip text={`folate ${fmt(r.estimated.folate_ug)} µg*`} tint />
        <Chip text={`calcium ${fmt(r.estimated.calcium_mg)} mg*`} tint />
      </View>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityRole="button">
        <Text style={{ color: t.primary, fontWeight: "700", fontSize: 13 }}>{open ? "Hide recipe" : "Ingredients & steps"}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color={t.primary} />
      </Pressable>
      {open ? (
        <View style={{ gap: 12 }}>
          <Bullets items={r.RecipeIngredientParts} />
          {(r.RecipeInstructions ?? []).map((step, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <View style={[st.stepNo, { backgroundColor: t.primarySoft }]}>
                <Text style={{ color: t.primaryDeep, fontSize: 12, fontWeight: "800" }}>{i + 1}</Text>
              </View>
              <Text style={{ color: t.text, flex: 1, lineHeight: 21 }}>{step}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Chip({ text, strong, tint }: { text: string; strong?: boolean; tint?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: tint ? t.successSoft : t.muted2 }}>
      <Text style={{ color: tint ? t.success : t.text, fontSize: 12, fontWeight: strong ? "800" : "600" }}>{text}</Text>
    </View>
  );
}

/** Context that shaped the plan (vitals, medicines) and the AI reviewer's summary. */
export function PlanContextCard({ plan, day }: { plan: MealPlan; day: PlanDay }) {
  const t = useTheme();
  if (!plan.context.length && !day.summary) return null;
  return (
    <Card tone="tinted" style={{ gap: 12 }}>
      {day.summary ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <IconCircle name="checkmark-done" size={34} tone="solid" />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: t.primaryDeep, fontWeight: "800", fontSize: 12, letterSpacing: 0.6 }}>
              {plan.reviewed_by === "gemini" ? "CHECKED BY THE AI REVIEWER" : "CHECKED AGAINST YOUR RESTRICTIONS"}
            </Text>
            <Text style={{ color: t.text, lineHeight: 21 }}>{day.summary}</Text>
          </View>
        </View>
      ) : null}
      {plan.context.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: t.muted, fontWeight: "800", fontSize: 11, letterSpacing: 1.2 }}>ADJUSTED FOR YOU</Text>
          <Bullets items={plan.context} />
        </View>
      ) : null}
    </Card>
  );
}

export function DayPlan({ plan, info, onChange }: { plan: MealPlan; info: PregnancyInfo; onChange: (p: MealPlan) => void }) {
  const t = useTheme();
  const [dayIdx, setDayIdx] = useState(0);
  const [swap, setSwap] = useState<{ slot: string; options: SwapOption[] | null; error?: string } | null>(null);
  const day = plan.days[Math.min(dayIdx, plan.days.length - 1)];

  if (plan.source === "ai") {
    return (
      <View style={{ gap: 14 }}>
        <Card tone="tinted">
          <Text style={{ color: t.text, lineHeight: 21 }}>
            No recipes in our collection fitted all your restrictions, so this day was written by the AI. Nutrients are approximate.
          </Text>
        </Card>
        {(day.ai_meals ?? []).map((m) => (
          <Card key={m.slot} style={{ gap: 8 }}>
            <Text style={[typo.eyebrow, { color: t.primary }]}>{SLOT_LABEL[m.slot]}</Text>
            <Text style={[typo.headline, { color: t.text }]}>{m.name}</Text>
            <Text style={{ color: t.muted }}>≈ {Math.round(m.kcal)} kcal · {Math.round(m.protein_g)} g protein</Text>
            <Bullets items={m.ingredients} />
          </Card>
        ))}
      </View>
    );
  }

  async function openSwap(m: PlanMeal) {
    setSwap({ slot: m.slot, options: null });
    try {
      const res = await getSwaps(info, day, m.slot);
      setSwap({ slot: m.slot, options: res.options });
    } catch (e) {
      setSwap({ slot: m.slot, options: [], error: e instanceof Error ? e.message : "Could not load options" });
    }
  }

  const meals = SLOT_ORDER.map((s) => day.meals.find((m) => m.slot === s)).filter(Boolean) as PlanMeal[];
  return (
    <View style={{ gap: 16 }}>
      {plan.days.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {plan.days.map((d, i) => {
            const on = i === dayIdx;
            return (
              <Pressable
                key={d.day}
                onPress={() => {
                  setDayIdx(i);
                  setSwap(null);
                }}
                style={[st.dayChip, { backgroundColor: on ? t.primary : t.card, borderColor: on ? t.primary : t.border }]}
              >
                <Text style={{ color: on ? t.onPrimary : t.text, fontWeight: "800" }}>Day {d.day}</Text>
                <Text style={{ color: on ? t.onPrimary : t.muted, fontSize: 11, opacity: 0.85 }}>
                  {d.targets_met}/{d.targets_total}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <CoverageCard day={day} />
      <PlanContextCard plan={plan} day={day} />

      <View style={{ gap: 14 }}>
        {meals.map((m, i) => (
          <View key={m.slot} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", width: 18 }}>
              <View style={[st.dot, { backgroundColor: t.primary, borderColor: t.bg }]} />
              {i < meals.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: t.primarySoft, marginTop: 4 }} /> : null}
            </View>
            <View style={{ flex: 1, gap: 8, paddingBottom: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ color: t.text, fontWeight: "800" }}>{m.label}</Text>
                <Text style={{ color: t.subtle, fontSize: 12 }}>{SLOT_TIME[m.slot]}</Text>
                {day.changed?.some((c) => c.slot === m.slot) ? (
                  <View style={{ backgroundColor: t.infoSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: t.info, fontSize: 11, fontWeight: "700" }}>Updated for your latest readings</Text>
                  </View>
                ) : null}
              </View>
              <MealCard meal={m} onSwap={() => void openSwap(m)} busy={swap?.slot === m.slot && swap.options === null} />
              {swap?.slot === m.slot && swap.options ? (
                <View style={[st.swapBox, { backgroundColor: t.primaryTint, borderColor: t.primarySoft }]}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ color: t.text, fontWeight: "800", flex: 1 }}>Swap for…</Text>
                    <Pressable onPress={() => setSwap(null)} hitSlop={10}>
                      <Text style={{ color: t.muted, fontWeight: "700" }}>Cancel</Text>
                    </Pressable>
                  </View>
                  {swap.error ? <Text style={{ color: t.danger }}>{swap.error}</Text> : null}
                  {!swap.error && !swap.options.length ? <Text style={{ color: t.muted }}>No other options fit.</Text> : null}
                  {swap.options.map((o) => (
                    <Pressable
                      key={o.meal.recipe.RecipeId}
                      onPress={() => {
                        onChange({ ...plan, days: plan.days.map((d, j) => (j === dayIdx ? applySwap(d, o) : d)) });
                        setSwap(null);
                      }}
                      style={({ pressed }) => [st.option, { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.text, fontWeight: "700" }} numberOfLines={1}>
                          {o.meal.recipe.Name}
                        </Text>
                        <Text style={{ color: t.muted, fontSize: 12 }}>
                          {fmt(o.meal.recipe.Calories)} kcal · {fmt(o.meal.recipe.ProteinContent, 1)} g protein
                        </Text>
                      </View>
                      <View style={{ backgroundColor: t.successSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                        <Text style={{ color: t.success, fontWeight: "800", fontSize: 12 }}>
                          {o.targets_met}/{day.targets_total}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {plan.notes.length ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: t.text, fontWeight: "800" }}>Good to know</Text>
          <Bullets items={plan.notes} />
        </Card>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  meal: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 10 },
  swap: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6 },
  stepNo: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  dayChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center" },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, marginTop: 2 },
  swapBox: { borderWidth: 1, borderRadius: 18, padding: 12, gap: 8 },
  option: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 12 },
});
