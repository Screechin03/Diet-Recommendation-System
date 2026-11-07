import { apiBaseUrl, jsonError, proxyJson } from "../../_proxy";

export const maxDuration = 60;

/** Live USB capture → FastAPI POST /vitals/analyze ({ lines, pregnancy_month?, activity? }). */
export async function POST(req: Request) {
  try {
    return await proxyJson(req, `${apiBaseUrl()}/vitals/analyze`, { method: "POST" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the analysis service: ${msg}`, 502);
  }
}
