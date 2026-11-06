// Remembers the pregnancy profile on-device so the user doesn't retype it every visit.
import "expo-sqlite/localStorage/install";
import type { PregnancyInfo } from "./types";

const KEY = "mamacare.pregnancyProfile.v1";

export function defaultPregnancyInfo(): PregnancyInfo {
  return {
    pregnancy_month: 4,
    age: 28,
    pre_pregnancy_weight: 60,
    current_weight: 64,
    height: 165,
    has_gestational_diabetes: false,
    has_anemia: false,
    has_morning_sickness: false,
    has_heartburn: false,
    has_constipation: false,
    medications: [],
    food_aversions: [],
    food_cravings: [],
    dietary_restrictions: [],
    activity_level: "moderate",
  };
}

export function loadProfile(): PregnancyInfo {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultPregnancyInfo(), ...(JSON.parse(raw) as Partial<PregnancyInfo>) };
  } catch {
    // ignore corrupt/missing storage
  }
  return defaultPregnancyInfo();
}

export function saveProfile(profile: PregnancyInfo): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // non-critical
  }
}
