import { apiBaseUrl } from "../_proxy";

export async function POST(req: Request) {
  const formData = await req.formData();

  const url = `${apiBaseUrl()}/prescription_report`;
  const res = await fetch(url, {
    method: "POST",
    // Do NOT set content-type manually; fetch will set multipart boundary.
    body: formData,
    cache: "no-store",
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
