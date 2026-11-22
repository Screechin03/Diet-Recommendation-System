import { apiBaseUrl, jsonError, proxyJson } from "../../_proxy";

/** Fit an existing plan to fresh vitals / medicines with few swaps → FastAPI POST /meal-plan/adjust. */
export async function POST(req: Request) {
  try {
    return await proxyJson(req, `${apiBaseUrl()}/meal-plan/adjust`, { method: "POST" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the meal planner: ${msg}`, 502);
  }
}
