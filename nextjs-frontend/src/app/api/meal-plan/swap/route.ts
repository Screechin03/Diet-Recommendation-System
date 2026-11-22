import { apiBaseUrl, jsonError, proxyJson } from "../../_proxy";

/** Replacements for one meal → FastAPI POST /meal-plan/swap ({ pregnancy_info, meals, slot }). */
export async function POST(req: Request) {
  try {
    return await proxyJson(req, `${apiBaseUrl()}/meal-plan/swap`, { method: "POST" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the meal planner: ${msg}`, 502);
  }
}
