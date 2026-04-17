const DEFAULT_BACKEND_URL = "http://localhost:8080";

export function getBackendUrl(): string {
  return process.env.BACKEND_URL?.trim() || DEFAULT_BACKEND_URL;
}

export function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(id),
  };
}
