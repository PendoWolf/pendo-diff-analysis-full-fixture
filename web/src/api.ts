// API base URL. Defaults to the local server; override via VITE_API_URL for
// deployed/preview environments (QAWolf runs against whatever URL this points at).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface AppState {
  counter: number;
  lastAction: string;
}

type Method = "GET" | "POST";

// Error thrown by call() for any failed request. It carries the request details
// as fields, not only in the message, so App.tsx can report them to Pendo.
// httpStatus is undefined when no response arrived (network/CORS error).
export class ApiError extends Error {
  readonly method: Method;
  readonly path: string;
  readonly httpStatus?: number;

  constructor(message: string, method: Method, path: string, httpStatus?: number) {
    super(message);
    this.name = "ApiError";
    this.method = method;
    this.path = path;
    this.httpStatus = httpStatus;
  }
}

async function call(path: string, method: Method): Promise<AppState> {
  let res: Response | undefined;
  try {
    res = await fetch(`${BASE}${path}`, { method });
    if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
    return (await res.json()) as AppState;
  } catch (e) {
    // res is still undefined if fetch itself rejected (network/CORS error).
    throw new ApiError((e as Error).message, method, path, res?.status);
  }
}

export const api = {
  getState: () => call("/api/state", "GET"),
  increment: () => call("/api/increment", "POST"),
  decrement: () => call("/api/decrement", "POST"),
  reset: () => call("/api/reset", "POST"),
};
