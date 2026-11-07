/** Same tables + RLS policies as the website (see nextjs-frontend/SUPABASE_SETUP.md). */
import type { Recipe } from "./types";
import type { VitalsAnalysis } from "./vitals";
import { requireSupabase } from "./supabase";

export interface SavedRecipeRow {
  id: string;
  recipe_name: string;
  recipe: Recipe;
  created_at: string;
}

export interface RecipeHistoryRow extends SavedRecipeRow {
  source_page: string;
}

export async function saveRecipe(userId: string, recipe: Recipe): Promise<void> {
  const { error } = await requireSupabase()
    .from("saved_recipes")
    .insert({ user_id: userId, recipe_name: recipe.Name, recipe });
  if (error) throw error;
}

export async function getSavedRecipes(userId: string): Promise<SavedRecipeRow[]> {
  const { data, error } = await requireSupabase()
    .from("saved_recipes")
    .select("id, recipe_name, recipe, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedRecipeRow[];
}

export async function removeSavedRecipe(userId: string, id: string): Promise<void> {
  const { error } = await requireSupabase().from("saved_recipes").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function recordHistory(userId: string, sourcePage: string, recipes: Recipe[]): Promise<void> {
  if (!recipes.length) return;
  const { error } = await requireSupabase()
    .from("recipe_history")
    .insert(recipes.map((recipe) => ({ user_id: userId, source_page: sourcePage, recipe_name: recipe.Name, recipe })));
  if (error) throw error;
}

export async function getHistory(userId: string): Promise<RecipeHistoryRow[]> {
  const { data, error } = await requireSupabase()
    .from("recipe_history")
    .select("id, recipe_name, recipe, source_page, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as RecipeHistoryRow[];
}

// Vitals device sessions (table vital_sessions; SQL in nextjs-frontend/SUPABASE_SETUP.md, section 5).
export interface VitalSessionRow {
  id: string;
  status: string;
  headline: string;
  duration_s: number;
  analysis: VitalsAnalysis;
  created_at: string;
}

export async function saveVitalSession(userId: string, analysis: VitalsAnalysis): Promise<string> {
  const { data, error } = await requireSupabase()
    .from("vital_sessions")
    .insert({ user_id: userId, status: analysis.status, headline: analysis.headline, duration_s: analysis.session.duration_s, analysis })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getVitalSessions(userId: string): Promise<VitalSessionRow[]> {
  const { data, error } = await requireSupabase()
    .from("vital_sessions")
    .select("id, status, headline, duration_s, analysis, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as VitalSessionRow[];
}

export async function deleteVitalSession(userId: string, id: string): Promise<void> {
  const { error } = await requireSupabase().from("vital_sessions").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}
