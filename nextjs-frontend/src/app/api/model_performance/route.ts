import { apiBaseUrl, jsonError, proxyJson } from "../_proxy";

export async function GET(req: Request) {
  try {
    const targetUrl = `${apiBaseUrl()}/model_performance`;
    return await proxyJson(req, targetUrl, { method: "GET" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Failed to reach backend: ${msg}`, 502);
  }
}
