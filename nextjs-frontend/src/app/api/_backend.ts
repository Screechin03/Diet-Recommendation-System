const DEFAULT_BACKEND_URL = "http://localhost:8080";

export function getBackendUrl(): string {
  const raw = process.env.BACKEND_URL?.trim() || DEFAULT_BACKEND_URL;
  return raw.replace(/\/+$/, "");
}

export function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(id),
  };
}
