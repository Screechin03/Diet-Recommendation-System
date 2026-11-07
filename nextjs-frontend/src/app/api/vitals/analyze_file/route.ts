import { forwardMultipart } from "../../_proxy";

export const maxDuration = 60;

/** SD-card session file → FastAPI POST /vitals/analyze_file (multipart: file, pregnancy_month?, activity?). */
export async function POST(req: Request) {
  return forwardMultipart(req, "/vitals/analyze_file", 55_000);
}
