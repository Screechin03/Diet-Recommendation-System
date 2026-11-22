import { apiBaseUrl, jsonError, proxyJson } from "../_proxy";

/** Day/week meal plan → FastAPI POST /meal-plan ({ pregnancy_info, days, seed? }). */
export async function POST(req: Request) {
  try {
    return await proxyJson(req, `${apiBaseUrl()}/meal-plan`, { method: "POST" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the meal planner: ${msg}`, 502);
  }
}
