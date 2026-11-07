import { apiBaseUrl, jsonError } from "../../_proxy";

export const maxDuration = 60;

/** Analysis JSON → PDF report (binary passthrough from FastAPI POST /vitals/report). */
export async function POST(req: Request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${apiBaseUrl()}/vitals/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await req.text(),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
    }
    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": res.headers.get("content-disposition") ?? 'attachment; filename="mamacare-vitals.pdf"',
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (controller.signal.aborted) return jsonError("Creating the report took too long. Please try again.", 504);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the report service: ${msg}`, 502);
  } finally {
    clearTimeout(timer);
  }
}
