import { useCallback, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { ErrorBox, InfoBox, Screen } from "@/components/ui";
import { RecipeCard } from "@/components/RecipeCard";
import { useAuth } from "@/lib/auth";
import { getSavedRecipes, removeSavedRecipe, type SavedRecipeRow } from "@/lib/userData";

export default function SavedScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SavedRecipeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      getSavedRecipes(user.id)
        .then(setRows)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load saved recipes"));
    }, [user]),
  );

  async function remove(id: string) {
    if (!user) return;
    try {
      await removeSavedRecipe(user.id, id);
      setRows((r) => r?.filter((x) => x.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove recipe");
    }
  }

  if (!user) return <Screen><InfoBox>Log in to see saved recipes.</InfoBox></Screen>;

  return (
    <Screen>
      <ErrorBox message={error} />
      {!rows && !error ? <ActivityIndicator /> : null}
      {rows && !rows.length ? <InfoBox>No saved recipes yet. Tap “Save recipe” on any recommendation.</InfoBox> : null}
      {rows?.map((row) => <RecipeCard key={row.id} recipe={row.recipe} onRemove={() => remove(row.id)} />)}
    </Screen>
  );
}
