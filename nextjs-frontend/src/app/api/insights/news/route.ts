import { apiBaseUrl, jsonError } from "../../_proxy";

// Public, non-personal data: allow the app's web build to read it from another origin.
const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=900" };

/** One pregnancy research news item (or a daily tip) → FastAPI GET /insights/news (cached there for 6 h). */
export async function GET() {
  try {
    const res = await fetch(`${apiBaseUrl()}/insights/news`, { cache: "no-store" });
    if (!res.ok) return jsonError(`News service error (${res.status})`, 502);
    return Response.json(await res.json(), { headers: CORS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the news service: ${msg}`, 502);
  }
}
