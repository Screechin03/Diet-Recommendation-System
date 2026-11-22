import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Button,
  Card,
  Chips,
  Col,
  Disclaimer,
  ErrorBox,
  Field,
  FieldLabel,
  H2,
  IconCircle,
  InfoBox,
  NumberField,
  PageHeader,
  Row,
  Screen,
  Section,
  Segmented,
  Stat,
  ToggleRow,
} from "@/components/ui";
import { RecipeCard } from "@/components/RecipeCard";
import { DayPlan } from "@/components/MealPlan";
import {
  adjustMealPlan,
  getMealPlan,
  loadCurrentPlan,
  loadPlanContext,
  reviewMealPlan,
  saveCurrentPlan,
  todayIndex,
  type MealPlan,
  type VitalsContext,
} from "@/lib/mealPlan";
import { ShareWithDoctor } from "@/components/Care";
import { useTheme } from "@/components/theme";
import { useLiveData } from "@/lib/careHooks";
import { doctorName, getDietInstructions, hasDietInstructions, savePatientProfile, type DietInstructions } from "@/lib/care";
import { dietPlanRecord } from "@/lib/careRecords";
import { Refined } from "@/components/Refined";
import { parseCsvList, predictRecipes, refine } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadProfile, saveProfile } from "@/lib/profile";
import { recordHistory, saveRecipe } from "@/lib/userData";
import type { ActivityLevel, PredictionOut, PregnancyInfo, Recipe, RefinedSummary } from "@/lib/types";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => ({ value: m, label: String(m) }));
const ACTIVITY: Array<{ value: ActivityLevel; label: string }> = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];
// Keys match canonicalizeRestriction() in the web app's /api/predict route.
const RESTRICTIONS = [
  { value: "vegan", label: "Vegan" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "gluten-free", label: "Gluten-free" },
  { value: "dairy-free", label: "Dairy-free" },
  { value: "egg-free", label: "Egg-free" },
  { value: "nut-free", label: "Nut-free" },
  { value: "soy-free", label: "Soy-free" },
];
const CONDITIONS: Array<{ key: keyof PregnancyInfo; label: string }> = [
  { key: "has_gestational_diabetes", label: "Gestational diabetes" },
  { key: "has_anemia", label: "Anemia" },
  { key: "has_morning_sickness", label: "Morning sickness" },
  { key: "has_heartburn", label: "Heartburn" },
  { key: "has_constipation", label: "Constipation" },
];
const COUNTS = [3, 5, 8, 10].map((n) => ({ value: n, label: String(n) }));

/** Lower-cased union of two lists, keeping order. */
function union(a: string[] | undefined, b: string[] | undefined): string[] {
  return Array.from(new Set([...(a ?? []), ...(b ?? [])].map((x) => x.trim().toLowerCase()).filter(Boolean)));
}

export default function PlannerScreen() {
  const t = useTheme();
  const { user, role, careAvailable } = useAuth();
  const isPatient = Boolean(user) && role === "patient" && careAvailable;
  const [doctorDiet, setDoctorDiet] = useState<DietInstructions | null>(null);
  const loadDoctorDiet = useCallback(async () => {
    if (!user || !isPatient) return;
    try {
      setDoctorDiet(await getDietInstructions(user.id));
    } catch {
      // the planner works without them
    }
  }, [user, isPatient]);
  useLiveData(loadDoctorDiet, 60_000);
  const di = hasDietInstructions(doctorDiet) ? doctorDiet : null;
  const [lastRun, setLastRun] = useState<{ id: number; info: PregnancyInfo; ingredients: string[]; di: DietInstructions | null } | null>(null);
  const [profile, setProfileState] = useState<PregnancyInfo>(loadProfile);
  const [mode, setMode] = useState<"day" | "recipes">("day");
  // Opened from a vitals result or a medicine check: plan with exactly those readings / medicines.
  const params = useLocalSearchParams<{ vitals?: string; medicines?: string }>();
  const [handoff, setHandoff] = useState<{ key: string; vitals: VitalsContext | null; medicines: string[] } | null>(null);
  const handoffKey = `${params.vitals ?? ""}|${params.medicines ?? ""}`;
  if (handoffKey !== "|" && handoff?.key !== handoffKey) {
    let vitals: VitalsContext | null = null;
    let medicines: string[] = [];
    try {
      vitals = params.vitals ? (JSON.parse(params.vitals) as VitalsContext) : null;
      medicines = params.medicines ? (JSON.parse(params.medicines) as string[]) : [];
    } catch {
      // ignore a malformed link
    }
    setHandoff({ key: handoffKey, vitals, medicines });
    setMode("day");
  }
  const [planDays, setPlanDays] = useState<1 | 7>(1);
  // The current plan lives on the phone, so a week's plan is still here tomorrow.
  const [plan, setPlan] = useState<{ id: number; value: MealPlan; info: PregnancyInfo; di: DietInstructions | null; savedAt: string } | null>(() => {
    const saved = loadCurrentPlan();
    return saved ? { id: 1, value: saved.plan, info: saved.info, di: null, savedAt: saved.savedAt } : null;
  });
  const [adjustNote, setAdjustNote] = useState<string | null>(null);
  function showPlan(next: { id: number; value: MealPlan; info: PregnancyInfo; di: DietInstructions | null; savedAt: string }) {
    setPlan(next);
    saveCurrentPlan(next.value, next.info, next.savedAt);
  }
  const [planBusy, setPlanBusy] = useState(false);
  const [ingredients, setIngredients] = useState("");
  const [aversions, setAversions] = useState((profile.food_aversions ?? []).join(", "));
  const [count, setCount] = useState(5);
  const [useAi, setUseAi] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [meta, setMeta] = useState<PredictionOut["meta"] | null>(null);
  const [refined, setRefined] = useState<RefinedSummary | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  function update(patch: Partial<PregnancyInfo>) {
    setProfileState((p) => {
      const next = { ...p, ...patch };
      saveProfile(next);
      return next;
    });
  }

  function toggleRestriction(key: string) {
    const cur = profile.dietary_restrictions ?? [];
    update({ dietary_restrictions: cur.includes(key) ? cur.filter((r) => r !== key) : [...cur, key] });
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setRecipes(null);
    setMeta(null);
    setRefined(null);
    setSaved({});
    // The doctor's instructions are always applied on top of what the patient entered.
    const pregnancy_info: PregnancyInfo = {
      ...profile,
      food_aversions: union(parseCsvList(aversions), di?.avoid),
      dietary_restrictions: union(profile.dietary_restrictions, di?.restrictions),
    };
    const ingredientList = union(parseCsvList(ingredients), di?.include);
    try {
      const data = await predictRecipes({
        pregnancy_info,
        ingredients: ingredientList,
        params: { n_neighbors: count, return_distance: false },
      });
      const output = data.output ?? [];
      setRecipes(output);
      setMeta(data.meta ?? null);
      setLastRun((prev) => ({ id: (prev?.id ?? 0) + 1, info: pregnancy_info, ingredients: ingredientList, di }));
      if (user && isPatient) {
        // What the patient's doctor sees (her own entries, without the doctor's additions).
        savePatientProfile(user.id, { ...profile, food_aversions: parseCsvList(aversions) }).catch(() => {});
      }

      if (user && output.length) recordHistory(user.id, "mobile-diet-planner", output).catch(() => {});

      if (useAi && output.length) {
        setRefined(
          await refine("recipes", {
            pregnancy_info,
            ingredients: ingredientList,
            recipes: output.slice(0, 5).map((r) => ({
              Name: r.Name,
              Calories: r.Calories,
              ProteinContent: r.ProteinContent,
              CarbohydrateContent: r.CarbohydrateContent,
              FatContent: r.FatContent,
              FiberContent: r.FiberContent,
              pregnancy_benefits: r.pregnancy_benefits ?? [],
              RecipeIngredientParts: r.RecipeIngredientParts?.slice(0, 12) ?? [],
            })),
          }),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function makePlan() {
    setPlanBusy(true);
    setError(null);
    // Same profile as the recipe search, with the doctor's instructions on top.
    const info: PregnancyInfo = {
      ...profile,
      food_aversions: union(parseCsvList(aversions), di?.avoid),
      dietary_restrictions: union(profile.dietary_restrictions, di?.restrictions),
    };
    try {
      const saved = await loadPlanContext(isPatient && user ? user.id : null);
      const context = {
        vitals: handoff?.vitals ?? saved.vitals,
        medicines: Array.from(new Set([...(handoff?.medicines ?? []), ...saved.medicines])),
      };
      const value = await getMealPlan(info, planDays, context);
      const id = (plan?.id ?? 0) + 1;
      showPlan({ id, value, info, di, savedAt: new Date().toISOString() });
      setAdjustNote(null);
      if (user && isPatient) savePatientProfile(user.id, { ...profile, food_aversions: parseCsvList(aversions) }).catch(() => {});
      // Real-time plan first; the AI review (restrictions, pregnancy safety, summary) lands a few seconds later.
      reviewMealPlan(info, value)
        .then(({ plan: reviewed }) =>
          setPlan((p) => {
            if (!p || p.id !== id) return p;
            saveCurrentPlan(reviewed, p.info, p.savedAt);
            return { ...p, value: reviewed };
          }),
        )
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make a plan");
    } finally {
      setPlanBusy(false);
    }
  }

  /** Fresh vitals / medicines: adjust the current plan (at most 2 swaps a day) instead of replacing it. */
  async function adjustPlan() {
    if (!plan) return;
    setPlanBusy(true);
    setError(null);
    try {
      const stored = await loadPlanContext(isPatient && user ? user.id : null);
      const context = { vitals: handoff?.vitals ?? stored.vitals, medicines: Array.from(new Set([...(handoff?.medicines ?? []), ...stored.medicines])) };
      const saved = { plan: plan.value, info: plan.info, savedAt: plan.savedAt };
      const { plan: adjusted, changes } = await adjustMealPlan(saved, context);
      showPlan({ ...plan, id: plan.id + 1, value: adjusted });
      setAdjustNote(
        changes
          ? `${changes} meal${changes === 1 ? "" : "s"} changed from day ${todayIndex(saved) + 1} on; everything else stays as planned.`
          : "Your plan already fits these readings: nothing needed to change.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not adjust the plan");
    } finally {
      setPlanBusy(false);
    }
  }

  async function onSave(recipe: Recipe) {
    if (!user) {
      router.push("/login");
      return;
    }
    setSaving(recipe.Name);
    try {
      await saveRecipe(user.id, recipe);
      setSaved((s) => ({ ...s, [recipe.Name]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save recipe");
    } finally {
      setSaving(null);
    }
  }

  const corrections = [...(meta?.ingredient_corrections ?? []), ...(meta?.substitutions ?? [])];
  const bmi = profile.height > 0 ? profile.pre_pregnancy_weight / (profile.height / 100) ** 2 : 0;
  const gain = profile.current_weight - profile.pre_pregnancy_weight;
  const trimester = profile.pregnancy_month <= 3 ? 1 : profile.pregnancy_month <= 6 ? 2 : 3;

  return (
    <Screen safeTop>
      <PageHeader eyebrow="Diet plan" title="Meals for you" subtitle="Recipes matched to your month, your health and what you feel like eating." />
      <Row gap={10}>
        <Stat label="Month" value={String(profile.pregnancy_month)} caption={`Trimester ${trimester}`} tone="rose" />
        <Stat label="BMI before" value={bmi ? bmi.toFixed(1) : "–"} caption={!bmi ? "" : bmi < 18.5 ? "Under" : bmi < 25 ? "Healthy" : bmi < 30 ? "Over" : "High"} />
        <Stat label="Gained" value={`${gain >= 0 ? "+" : ""}${gain.toFixed(1)}`} unit="kg" caption="since before" />
      </Row>
      {handoff && (handoff.vitals || handoff.medicines.length) ? (
        <View style={{ backgroundColor: t.primaryTint, borderRadius: 18, padding: 14, flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Ionicons name={handoff.vitals ? "pulse" : "medkit"} size={20} color={t.primary} />
          <Text style={{ color: t.text, flex: 1, lineHeight: 20 }}>
            {handoff.vitals ? "Using the vital signs you just measured." : `Planning around ${handoff.medicines.length} medicine${handoff.medicines.length === 1 ? "" : "s"}.`}{" "}
            {plan ? "Adjust your current plan (at most 2 meals a day change) or make a new one." : "Tap “Plan my day”."}
          </Text>
        </View>
      ) : null}
      {handoff && plan && (handoff.vitals || handoff.medicines.length) ? (
        <Button title="Adjust my current plan" icon="git-compare-outline" onPress={adjustPlan} loading={planBusy} />
      ) : null}
      <Segmented
        options={[
          { value: "day" as const, label: "Day plan" },
          { value: "recipes" as const, label: "Recipe ideas" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {di ? (
        <View style={{ backgroundColor: t.infoSoft, borderRadius: 20, padding: 16, gap: 6, flexDirection: "row" }}>
          <Ionicons name="medical" size={20} color={t.info} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: t.info, fontWeight: "800" }}>{doctorName(di.updated_by_name)}’s instructions are applied automatically</Text>
          <Text style={{ color: t.text }}>
            {[
              di.restrictions.length ? `Diet: ${di.restrictions.join(", ")}` : null,
              di.avoid.length ? `Avoiding: ${di.avoid.join(", ")}` : null,
              di.include.length ? `Favouring: ${di.include.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {di.note ? <Text style={{ color: t.text, fontStyle: "italic" }}>“{di.note}”</Text> : null}
          </View>
        </View>
      ) : null}
      <Section icon="body-outline" title="Your pregnancy" subtitle="Saved on this phone for next time">
        <FieldLabel>Month of pregnancy</FieldLabel>
        <Chips options={MONTHS} selected={[profile.pregnancy_month]} onToggle={(m) => update({ pregnancy_month: m })} />
        <Row>
          <Col>
            <NumberField label="Age" value={profile.age} onChange={(age) => update({ age })} />
          </Col>
          <Col>
            <NumberField label="Height" unit="cm" value={profile.height} onChange={(height) => update({ height })} decimal />
          </Col>
        </Row>
        <Row>
          <Col>
            <NumberField
              label="Weight before"
              unit="kg"
              value={profile.pre_pregnancy_weight}
              onChange={(pre_pregnancy_weight) => update({ pre_pregnancy_weight })}
              decimal
            />
          </Col>
          <Col>
            <NumberField
              label="Weight now"
              unit="kg"
              value={profile.current_weight}
              onChange={(current_weight) => update({ current_weight })}
              decimal
            />
          </Col>
        </Row>
        <FieldLabel>Activity level</FieldLabel>
        <Segmented options={ACTIVITY} value={profile.activity_level ?? "moderate"} onChange={(activity_level) => update({ activity_level })} />
      </Section>

      <Section icon="fitness-outline" title="Health conditions" subtitle="Recipes are adjusted for each one you switch on">
        {CONDITIONS.map((c) => (
          <ToggleRow
            key={c.key}
            label={c.label}
            value={Boolean(profile[c.key])}
            onChange={(v) => update({ [c.key]: v } as Partial<PregnancyInfo>)}
          />
        ))}
      </Section>

      <Section icon="restaurant-outline" title="Food preferences">
        <FieldLabel>Dietary restrictions</FieldLabel>
        <Chips options={RESTRICTIONS} selected={profile.dietary_restrictions ?? []} onToggle={toggleRestriction} />
        {mode === "recipes" ? (
        <Field
          label="Ingredients you want to use"
          placeholder="e.g. spinach, lentils, paneer"
          value={ingredients}
          onChangeText={setIngredients}
          hint="Optional. Comma separated. Typos are auto-corrected."
          autoCapitalize="none"
        />
        ) : null}
        <Field
          label="Foods you can't stand right now"
          placeholder="e.g. fish, garlic"
          value={aversions}
          onChangeText={setAversions}
          autoCapitalize="none"
        />
        {mode === "recipes" ? (
          <>
            <FieldLabel>Number of recipes</FieldLabel>
            <Segmented options={COUNTS} value={count} onChange={setCount} />
            <ToggleRow label="Explain the picks" hint="A short plain-language note on why these recipes fit you" value={useAi} onChange={setUseAi} />
          </>
        ) : (
          <>
            <FieldLabel>Plan length</FieldLabel>
            <Segmented
              options={[
                { value: 1 as const, label: "Today" },
                { value: 7 as const, label: "A week" },
              ]}
              value={planDays}
              onChange={setPlanDays}
            />
          </>
        )}
      </Section>

      {mode === "day" ? (
        <Button title={plan ? "Make a new plan" : "Plan my day"} icon="calendar" onPress={makePlan} loading={planBusy} />
      ) : (
        <Button title="Get my recipes" icon="restaurant" onPress={submit} loading={loading} />
      )}
      <ErrorBox message={error} />

      {corrections.length ? (
        <InfoBox>
          Adjusted your ingredients: {corrections.map((c) => `${c.from} → ${c.to}`).join(", ")}
        </InfoBox>
      ) : null}

      {mode === "day" && plan ? (
        <>
          <ShareWithDoctor
            key={`plan-${plan.id}`}
            what="this meal plan"
            build={() =>
              dietPlanRecord({
                pregnancy_info: plan.info,
                ingredients: [],
                recipes: plan.value.days.flatMap((d) => d.meals.map((m) => m.recipe)),
                meta: null,
                refined: null,
                meal_plan: plan.value,
                doctor_instructions: plan.di
                  ? { avoid: plan.di.avoid, include: plan.di.include, restrictions: plan.di.restrictions, note: plan.di.note, by: plan.di.updated_by_name }
                  : null,
              })
            }
          />
          {adjustNote ? <InfoBox>{adjustNote}</InfoBox> : null}
          <DayPlan key={plan.id} plan={plan.value} info={plan.info} onChange={(value) => showPlan({ ...plan, value })} />
        </>
      ) : null}

      {mode === "recipes" ? <Refined refined={refined} /> : null}

      {mode === "recipes" && recipes ? (
        recipes.length ? (
          <>
            {lastRun ? (
              <ShareWithDoctor
                key={lastRun.id}
                what="this diet plan"
                build={() =>
                  dietPlanRecord({
                    pregnancy_info: lastRun.info,
                    ingredients: lastRun.ingredients,
                    recipes,
                    meta: meta ?? null,
                    refined: refined ?? null,
                    doctor_instructions: lastRun.di
                      ? { avoid: lastRun.di.avoid, include: lastRun.di.include, restrictions: lastRun.di.restrictions, note: lastRun.di.note, by: lastRun.di.updated_by_name }
                      : null,
                  })
                }
              />
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 }}>
              <IconCircle name="checkmark-done" size={36} tone="solid" />
              <H2>{`${recipes.length} recipes for you`}</H2>
            </View>
            {recipes.map((r, i) => (
              <RecipeCard
                key={`${r.Name}-${i}`}
                recipe={r}
                onSave={() => onSave(r)}
                saving={saving === r.Name}
                saved={saved[r.Name]}
              />
            ))}
          </>
        ) : (
          <InfoBox>No matching recipes. Try fewer ingredients or remove a restriction.</InfoBox>
        )
      ) : null}

      <Disclaimer />
    </Screen>
  );
}
