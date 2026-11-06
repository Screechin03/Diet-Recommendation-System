import { forwardMultipart } from "../_proxy";

export const maxDuration = 120;

/** Proxies to FastAPI POST /prescription_report (block-letter scan + Gemini extraction + diet plan). */
export async function POST(req: Request) {
  return forwardMultipart(req, "/prescription_report", 110_000);
}
