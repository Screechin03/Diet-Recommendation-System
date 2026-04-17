import { NextResponse } from "next/server";

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:8080";
}

export async function proxyJson(
  req: Request,
  targetUrl: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  const res = await fetch(targetUrl, {
    ...init,
    headers,
    cache: "no-store",
    body: init?.body ?? (req.method === "GET" ? undefined : await req.text()),
  });

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
