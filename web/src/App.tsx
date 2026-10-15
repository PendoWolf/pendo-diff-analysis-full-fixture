import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

// Counter actions. Each one goes through run() and is reported to Pendo.
type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

// Pendo Track Event properties: flat, primitive values only.
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
//
// Emits "demo-<name>": demo-load, demo-increment, demo-decrement, demo-reset,
// demo-refresh and demo-action-failed. Pendo matches these names exactly
// (case-sensitive), so renaming one would split its data into a new track type.
function trackEvent(name: Action | "action-failed", props?: TrackProps) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(`demo-${name}`, props);
    } catch (e) {
      // Analytics must never break the app or be reported as a failed action.
      console.warn("Pendo track failed", e);
    }
  }
}

// Properties for a successful action's event. `previous` is the state that was
// on screen when the action started; `next` is the state the server returned.
function successProps(action: Action, previous: AppState, next: AppState): TrackProps {
  switch (action) {
    case "load":
      // Starting state. lastAction is "none" after a server restart.
      return { counter: next.counter, lastAction: next.lastAction };
    case "refresh":
      // All sessions share the counter, so a refresh can pick up their changes.
      return {
        counter: next.counter,
        previousCounter: previous.counter,
        counterChanged: next.counter !== previous.counter,
        lastAction: next.lastAction,
      };
    case "increment":
    case "decrement":
    case "reset":
      return {
        counter: next.counter,
        previousCounter: previous.counter,
        previousAction: previous.lastAction,
      };
  }
}

// Properties for demo-action-failed. HTTP errors (ApiError) carry method, path
// and status; network errors (fetch rejected, API unreachable) have no status.
function failureProps(action: Action, previous: AppState, e: unknown): TrackProps {
  return {
    action,
    errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 100),
    counter: previous.counter,
    ...(e instanceof ApiError ? { method: e.method, path: e.path, status: e.status } : {}),
  };
}

// The initial load (and its demo-load event) should happen once per page load,
// but React StrictMode runs mount effects twice in development builds. A
// module-level flag skips the second run.
let initialLoadStarted = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: Action, fn: () => Promise<AppState>) => {
    // What was on screen when the user acted, for the Track Event properties.
    const previous = state;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      trackEvent(name, successProps(name, previous, next));
    } catch (e) {
      setError((e as Error).message);
      trackEvent("action-failed", failureProps(name, previous, e));
    }
  };

  useEffect(() => {
    if (initialLoadStarted) return;
    initialLoadStarted = true;
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
