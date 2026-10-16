// API base URL. Defaults to the local server; override via VITE_API_URL for
// deployed/preview environments (QAWolf runs against whatever URL this points at).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface AppState {
  counter: number;
  lastAction: string;
}

// Thrown for non-OK responses. Carries the HTTP status so callers don't have to
// parse it out of the message. It keeps the default name, "Error", which the
// demo-action-failed Track Event reports as errorName.
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call(path: string, method: "GET" | "POST"): Promise<AppState> {
  const res = await fetch(`${BASE}${path}`, { method });
  if (!res.ok) throw new ApiError(`${method} ${path} failed: ${res.status}`, res.status);
  return res.json() as Promise<AppState>;
}

export const api = {
  getState: () => call("/api/state", "GET"),
  increment: () => call("/api/increment", "POST"),
  decrement: () => call("/api/decrement", "POST"),
  reset: () => call("/api/reset", "POST"),
};
