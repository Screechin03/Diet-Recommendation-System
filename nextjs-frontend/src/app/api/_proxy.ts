import { NextResponse } from "next/server";

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function apiBaseUrl(): string {
  const configured = process.env.API_BASE_URL ?? process.env.BACKEND_URL;

  if (configured && configured.trim()) {
    return normalizeBaseUrl(configured);
  }

  if (process.env.VERCEL) {
    throw new Error("Missing API_BASE_URL (or BACKEND_URL) in environment variables");
  }

  return "http://localhost:8080";
}

function backendTimeoutMs(): number {
  const raw = Number(process.env.BACKEND_TIMEOUT_MS ?? "25000");
  if (!Number.isFinite(raw) || raw <= 0) return 25000;
  return Math.floor(raw);
}

export async function proxyJson(
  req: Request,
  targetUrl: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), backendTimeoutMs());
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      ...init,
      headers,
      cache: "no-store",
      signal: controller.signal,
      body: init?.body ?? (req.method === "GET" ? undefined : await req.text()),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = res.headers.get("content-type") ?? "application/json";
  const bodyText = await res.text();

  return new NextResponse(bodyText, {
    status: res.status,
    headers: {
      "content-type": contentType,
    },
  });
}

export function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/** Forwards a multipart upload to the FastAPI backend with a timeout and readable errors. */
export async function forwardMultipart(req: Request, path: string, timeoutMs: number): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonError("Expected a multipart/form-data upload with a 'file' field.", 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Do NOT set content-type manually; fetch adds the multipart boundary.
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      body: formData,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    if (controller.signal.aborted) return jsonError("The reading service took too long to respond.", 504);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonError(`Could not reach the reading service: ${msg}`, 502);
  } finally {
    clearTimeout(timer);
  }
}
