import { apiBaseUrl, jsonError, proxyJson } from "../../_proxy";

/** Pregnancy safety, interactions and timing plan → FastAPI POST /meds/check ({ medicines, pregnancy_month }). */
export async function POST(req: Request) {
  try {
    return await proxyJson(req, `${apiBaseUrl()}/meds/check`, { method: "POST" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the medicine service: ${msg}`, 502);
  }
}
