import { apiBaseUrl, jsonError, proxyJson } from "../../_proxy";

/** Rule audit + Gemini review of a plan → FastAPI POST /meal-plan/review. */
export async function POST(req: Request) {
  try {
    return await proxyJson(req, `${apiBaseUrl()}/meal-plan/review`, { method: "POST" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the meal planner: ${msg}`, 502);
  }
}
