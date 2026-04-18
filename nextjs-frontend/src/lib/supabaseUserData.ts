import type { Recipe } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export interface UserProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedRecipeRow {
  id: string;
  recipe_name: string;
  recipe: Recipe;
  created_at: string;
}

export interface RecipeHistoryRow {
  id: string;
  recipe_name: string;
  recipe: Recipe;
  source_page: string;
  created_at: string;
}

export async function saveRecipeForUser(userId: string, recipe: Recipe): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("saved_recipes").insert({
    user_id: userId,
    recipe_name: recipe.Name,
    recipe,
  });

  if (error) throw error;
}

export async function getSavedRecipesForUser(userId: string): Promise<SavedRecipeRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("saved_recipes")
    .select("id, recipe_name, recipe, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SavedRecipeRow[];
}

export async function removeSavedRecipeForUser(userId: string, savedRecipeId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("saved_recipes")
    .delete()
    .eq("user_id", userId)
    .eq("id", savedRecipeId);

  if (error) throw error;
}

export async function recordRecipeHistoryForUser(
  userId: string,
  sourcePage: string,
  recipes: Recipe[],
): Promise<void> {
  if (!recipes.length) return;

  const supabase = getSupabaseBrowserClient();
  const payload = recipes.map((recipe) => ({
    user_id: userId,
    source_page: sourcePage,
    recipe_name: recipe.Name,
    recipe,
  }));

  const { error } = await supabase.from("recipe_history").insert(payload);
  if (error) throw error;
}

export async function getRecipeHistoryForUser(userId: string): Promise<RecipeHistoryRow[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("recipe_history")
    .select("id, recipe_name, recipe, source_page, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RecipeHistoryRow[];
}

export async function upsertUserProfileForUser(
  userId: string,
  email: string,
  fullName: string | null,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("user_profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
    },
    { onConflict: "id" },
  );

  if (error) throw error;
}
