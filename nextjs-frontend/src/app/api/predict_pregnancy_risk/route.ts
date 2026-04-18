import { apiBaseUrl, jsonError, proxyJson } from "../_proxy";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const targetUrl = `${apiBaseUrl()}/predict_pregnancy_risk`;
    return await proxyJson(req, targetUrl, { method: "POST" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Failed to reach backend: ${msg}`, 502);
  }
}
