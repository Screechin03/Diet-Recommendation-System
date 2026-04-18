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
