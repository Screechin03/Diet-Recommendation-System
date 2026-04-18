export type ActivityLevel = "low" | "moderate" | "high";

export interface PregnancyInfo {
  pregnancy_month: number; // 1-9
  age: number;
  pre_pregnancy_weight: number;
  current_weight: number;
  height: number;
  has_gestational_diabetes?: boolean;
  has_anemia?: boolean;
  has_morning_sickness?: boolean;
  has_heartburn?: boolean;
  has_constipation?: boolean;
  medications?: string[];
  food_aversions?: string[];
  food_cravings?: string[];
  dietary_restrictions?: string[];
  activity_level?: ActivityLevel;
}

export interface PredictParams {
  n_neighbors: number;
  return_distance: boolean;
}

export interface PredictionIn {
  pregnancy_info: PregnancyInfo;
  ingredients: string[];
  params?: PredictParams;
}

export interface Recipe {
  Name: string;
  CookTime: string | number;
  PrepTime: string | number;
  TotalTime: string | number;
  RecipeIngredientParts: string[];
  Calories: number;
  FatContent: number;
  SaturatedFatContent: number;
  CholesterolContent: number;
  SodiumContent: number;
  CarbohydrateContent: number;
  FiberContent: number;
  SugarContent: number;
  ProteinContent: number;
  RecipeInstructions: string[];
  pregnancy_benefits?: string[];
}

export interface PredictionOut {
  output: Recipe[] | null;
  meta?: {
    ingredients_used?: string[];
    ingredient_corrections?: Array<{ from: string; to: string; reason?: string }>;
    gemini_used?: boolean;
    dietary_restrictions_applied?: string[];
    substitutions?: Array<{ from: string; to: string; reason?: string }>;
  };
}

export interface HealthAnalyticsInput {
  age: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  blood_sugar?: number;
  body_temp?: number;
  bmi?: number;
  heart_rate?: number;
  previous_complications?: boolean;
  preexisting_diabetes?: boolean;
  gestational_diabetes?: boolean;
  mental_health_issues?: boolean;
  smoking_history?: boolean;
  alcohol_consumption?: "none" | "occasional" | "regular";
  exercise_frequency?: "low" | "moderate" | "high";
  sleep_hours?: number;
  stress_level?: "low" | "moderate" | "high";
}

export interface HealthPredictionIn {
  health_data: HealthAnalyticsInput;
}

export interface RiskAssessment {
  risk_probability?: number;
  risk_level?: string;
  confidence?: number;
  risk_factors?: string[];
  [key: string]: unknown;
}

export interface RiskPredictionOut {
  risk_assessment?: RiskAssessment;
  recommendations?: unknown;
  success?: boolean;
  [key: string]: unknown;
}
