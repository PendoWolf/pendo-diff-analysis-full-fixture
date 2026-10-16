import { useEffect, useRef, useState } from "react";
import { api, ApiError, type AppState } from "./api";

// Actions the UI can run. Each successful one fires the Pendo Track Event
// `demo-<action>` (demo-load, demo-increment, demo-decrement, demo-reset,
// demo-refresh); a failed one fires demo-action-failed. Pendo matches these
// names exactly, so renaming one would send its data to a new track type.
type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: Action | "action-failed", props?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(`demo-${name}`, props);
    } catch {
      // Analytics must never break the app.
    }
  }
}

// Properties for a successful action's event. `prev` is the state on screen
// before the response and `next` is the server-confirmed state. The counter is
// shared by every visitor, so the two can differ by more than one step when
// someone else changed it in between.
function successProps(action: Action, prev: AppState, next: AppState): Record<string, unknown> {
  switch (action) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      return { counter: next.counter, previousCounter: prev.counter };
    case "reset":
      // The response is always { counter: 0, lastAction: "reset" }; what it wiped out says more.
      return { previousCounter: prev.counter, previousLastAction: prev.lastAction };
    case "refresh":
      return {
        counter: next.counter,
        lastAction: next.lastAction,
        previousCounter: prev.counter,
        counterChanged: prev.counter !== next.counter,
      };
  }
}

// Properties for demo-action-failed. errorMessage is only the method, path and
// status (or the browser's network/JSON error text), so it holds no PII.
function failureProps(action: Action, e: unknown): Record<string, unknown> {
  const err = e instanceof Error ? e : new Error(String(e));
  return {
    action,
    // Capped so the payload stays well under Pendo's 512-byte property limit.
    errorMessage: err.message.slice(0, 100),
    // Error for HTTP failures, TypeError for network failures, SyntaxError for bad JSON.
    errorName: err.name,
    // Only HTTP failures have a status; it's left out of the payload otherwise.
    status: err instanceof ApiError ? err.status : undefined,
  };
}

// StrictMode runs App's mount effect twice in development, so the initial load
// runs twice. Only the first run reports it, keeping demo-load (or a failed
// load) to once per page load. Module-level so it holds for the page's lifetime.
let loadStarted = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);
  // Latest state put on screen. Events compare a response with this rather than
  // run()'s `state`, which is stale if another click went out before it returned.
  const shownState = useRef(state);

  const run = async (name: Action, fn: () => Promise<AppState>, report = true) => {
    try {
      setError(null);
      const next = await fn();
      const prev = shownState.current;
      shownState.current = next;
      setState(next);
      if (report) trackEvent(name, successProps(name, prev, next));
    } catch (e) {
      setError((e as Error).message);
      if (report) trackEvent("action-failed", failureProps(name, e));
    }
  };

  useEffect(() => {
    run("load", api.getState, !loadStarted);
    loadStarted = true;
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
