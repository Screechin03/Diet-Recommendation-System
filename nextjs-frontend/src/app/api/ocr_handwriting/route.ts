import { forwardMultipart } from "../_proxy";

export const maxDuration = 60;

/** Proxies a multipart upload to FastAPI POST /ocr/handwriting (block-letter scanner, no Gemini needed). */
export async function POST(req: Request) {
  return forwardMultipart(req, "/ocr/handwriting", 30_000);
}
