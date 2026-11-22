// The small research-news card on Home (website /api/insights/news → FastAPI, cached there for 6 h).
import { apiBaseUrl } from "./api";

export interface NewsCard {
  kind: "news" | "tip";
  headline: string;
  summary: string;
  source: string;
  url: string | null;
  published: string | null;
  topic: string;
  ai_summary: boolean;
}

export async function getNews(): Promise<NewsCard | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/insights/news`);
    if (!res.ok) return null;
    const data = (await res.json()) as NewsCard;
    return data?.headline ? data : null;
  } catch {
    return null;
  }
}

/** Month of pregnancy → what to show on the journey card. Sizes are the usual approximate comparisons. */
export const MONTHS: Record<number, { weeks: string; size: string; focus: string[] }> = {
  1: { weeks: "Weeks 1–4", size: "a poppy seed", focus: ["Folic acid", "Iodine", "Rest"] },
  2: { weeks: "Weeks 5–8", size: "a raspberry", focus: ["Folic acid", "Vitamin B6", "Small meals"] },
  3: { weeks: "Weeks 9–13", size: "a lime", focus: ["Folic acid", "Iodine", "Hydration"] },
  4: { weeks: "Weeks 14–17", size: "an avocado", focus: ["Iron", "Calcium", "Protein"] },
  5: { weeks: "Weeks 18–22", size: "a banana", focus: ["Iron", "Omega-3", "Calcium"] },
  6: { weeks: "Weeks 23–27", size: "an ear of corn", focus: ["Iron", "Calcium", "Fibre"] },
  7: { weeks: "Weeks 28–31", size: "an aubergine", focus: ["Protein", "Iron", "Omega-3"] },
  8: { weeks: "Weeks 32–35", size: "a pineapple", focus: ["Protein", "Calcium", "Fibre"] },
  9: { weeks: "Weeks 36–40", size: "a small watermelon", focus: ["Protein", "Iron", "Rest"] },
};

export function trimesterOf(month: number): 1 | 2 | 3 {
  return month <= 3 ? 1 : month <= 6 ? 2 : 3;
}
