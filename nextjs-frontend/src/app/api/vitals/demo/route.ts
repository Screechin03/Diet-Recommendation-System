import { apiBaseUrl, jsonError, proxyJson } from "../../_proxy";

/** Simulated device session (clearly marked as sample data) → FastAPI GET /vitals/demo. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scenario = url.searchParams.get("scenario") ?? "normal";
  const seconds = url.searchParams.get("seconds") ?? "120";
  try {
    const qs = new URLSearchParams({ scenario, seconds });
    return await proxyJson(req, `${apiBaseUrl()}/vitals/demo?${qs}`, { method: "GET" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the demo service: ${msg}`, 502);
  }
}
