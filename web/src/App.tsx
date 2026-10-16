import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type ActionName = "load" | "increment" | "decrement" | "reset" | "refresh";
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a `demo-<name>` Track Event once an action settles:
// demo-load, demo-increment, demo-decrement, demo-reset or demo-refresh on
// success, demo-action-failed on failure. No-op when the agent isn't present
// (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: ActionName | "action-failed", props?: TrackProps) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(`demo-${name}`, props);
    } catch {
      // Analytics must never break the app or turn a success into a failure.
    }
  }
}

// Properties for a successful action: the API response plus the state the user
// saw when they acted. Each event only gets the fields that are meaningful for it.
function successProps(
  name: ActionName,
  next: AppState,
  prev: AppState,
  recoveredFromError: boolean,
): TrackProps {
  switch (name) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      return {
        counter: next.counter,
        previousCounter: prev.counter,
        previousLastAction: prev.lastAction,
        recoveredFromError,
      };
    case "reset":
      // The result is always 0, so record what was cleared instead.
      return {
        previousCounter: prev.counter,
        previousLastAction: prev.lastAction,
        recoveredFromError,
      };
    case "refresh":
      return {
        counter: next.counter,
        previousCounter: prev.counter,
        counterChanged: next.counter !== prev.counter,
        lastAction: next.lastAction,
        recoveredFromError,
      };
  }
}

// Properties for demo-action-failed. Non-2xx responses throw an ApiError with
// the status; fetch() itself rejects with a TypeError when no response arrives
// (backend down, CORS, or a wrong VITE_API_URL).
function failureProps(name: ActionName, e: unknown, isRepeatFailure: boolean): TrackProps {
  return {
    action: name,
    errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 100),
    // Present only when the server answered with a non-2xx status.
    ...(e instanceof ApiError ? { httpStatus: e.status } : {}),
    isNetworkError: e instanceof TypeError,
    isRepeatFailure,
  };
}

// React StrictMode runs mount effects twice in development; this keeps the
// initial load to one Track Event per page load.
let initialLoadTracked = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: ActionName, fn: () => Promise<AppState>) => {
    // What the user saw when they acted, sent as Track Event context.
    const prev = state;
    const hadError = error !== null;
    const shouldTrack = name !== "load" || !initialLoadTracked;
    if (name === "load") initialLoadTracked = true;

    try {
      setError(null);
      const next = await fn();
      setState(next);
      if (shouldTrack) trackEvent(name, successProps(name, next, prev, hadError));
    } catch (e) {
      setError((e as Error).message);
      if (shouldTrack) trackEvent("action-failed", failureProps(name, e, hadError));
    }
  };

  useEffect(() => {
    run("load", api.getState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
