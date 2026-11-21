import { apiBaseUrl, jsonError, proxyJson } from "../../_proxy";

/** Medicine name autocomplete (brand or generic) → FastAPI GET /meds/search. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  if (!q.trim()) return Response.json({ results: [] });
  try {
    const qs = new URLSearchParams({ q, limit: url.searchParams.get("limit") ?? "8" });
    return await proxyJson(req, `${apiBaseUrl()}/meds/search?${qs}`, { method: "GET" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the medicine service: ${msg}`, 502);
  }
}
