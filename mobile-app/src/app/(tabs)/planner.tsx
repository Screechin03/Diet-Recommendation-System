import { useState } from "react";
import { router } from "expo-router";
import {
  Body,
  Button,
  Card,
  Chips,
  Col,
  Disclaimer,
  ErrorBox,
  Field,
  H2,
  InfoBox,
  NumberField,
  Row,
  Screen,
  SectionLabel,
  ToggleRow,
} from "@/components/ui";
import { RecipeCard } from "@/components/RecipeCard";
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

export default function PlannerScreen() {
  const { user } = useAuth();
  const [profile, setProfileState] = useState<PregnancyInfo>(loadProfile);
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
    const pregnancy_info: PregnancyInfo = { ...profile, food_aversions: parseCsvList(aversions) };
    const ingredientList = parseCsvList(ingredients);
    try {
      const data = await predictRecipes({
        pregnancy_info,
        ingredients: ingredientList,
        params: { n_neighbors: count, return_distance: false },
      });
      const output = data.output ?? [];
      setRecipes(output);
      setMeta(data.meta ?? null);

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

  return (
    <Screen>
      <Card>
        <SectionLabel>Your pregnancy</SectionLabel>
        <Body>Month of pregnancy</Body>
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
        <Body>Activity level</Body>
        <Chips
          options={ACTIVITY}
          selected={[profile.activity_level ?? "moderate"]}
          onToggle={(activity_level) => update({ activity_level })}
        />
      </Card>

      <Card>
        <SectionLabel>Health conditions</SectionLabel>
        {CONDITIONS.map((c) => (
          <ToggleRow
            key={c.key}
            label={c.label}
            value={Boolean(profile[c.key])}
            onChange={(v) => update({ [c.key]: v } as Partial<PregnancyInfo>)}
          />
        ))}
      </Card>

      <Card>
        <SectionLabel>Food preferences</SectionLabel>
        <Body>Dietary restrictions</Body>
        <Chips options={RESTRICTIONS} selected={profile.dietary_restrictions ?? []} onToggle={toggleRestriction} />
        <Field
          label="Ingredients you want to use"
          placeholder="e.g. spinach, lentils, paneer"
          value={ingredients}
          onChangeText={setIngredients}
          hint="Optional. Comma separated. Typos are auto-corrected."
          autoCapitalize="none"
        />
        <Field
          label="Foods you can't stand right now"
          placeholder="e.g. fish, garlic"
          value={aversions}
          onChangeText={setAversions}
          autoCapitalize="none"
        />
        <Body>Number of recipes</Body>
        <Chips options={COUNTS} selected={[count]} onToggle={setCount} />
        <ToggleRow label="AI summary" hint="Plain-language explanation of why these recipes fit" value={useAi} onChange={setUseAi} />
      </Card>

      <Button title="Get my recipes" onPress={submit} loading={loading} />
      <ErrorBox message={error} />

      {corrections.length ? (
        <InfoBox>
          Adjusted your ingredients: {corrections.map((c) => `${c.from} → ${c.to}`).join(", ")}
        </InfoBox>
      ) : null}

      <Refined refined={refined} />

      {recipes ? (
        recipes.length ? (
          <>
            <H2>{recipes.length} recommended recipes</H2>
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
