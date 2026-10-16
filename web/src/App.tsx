import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

// Actions run() performs: success fires `demo-<action>`, failure fires `demo-action-failed`.
type Action = "load" | "increment" | "decrement" | "reset" | "refresh";
type TrackProps = Record<string, unknown>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: Action | "action-failed", props?: TrackProps) {
  if (typeof window !== "undefined") {
    window.pendo?.track?.(`demo-${name}`, props);
  }
}

// Properties sent with each success event. `previous` is the state on screen
// when the user acted and `next` is what the API returned. The counter is
// shared by every visitor, so `previous` can be out of date.
function successProps(action: Action, previous: AppState, next: AppState): TrackProps {
  switch (action) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "refresh":
      return {
        counter: next.counter,
        lastAction: next.lastAction,
        previousCounter: previous.counter,
        counterChanged: next.counter !== previous.counter,
      };
    case "increment":
    case "decrement":
    case "reset":
      return {
        counter: next.counter,
        previousCounter: previous.counter,
        previousLastAction: previous.lastAction,
      };
  }
}

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: Action, fn: () => Promise<AppState>) => {
    const previous = state;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      trackEvent(name, successProps(name, previous, next));
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      trackEvent("action-failed", {
        action: name,
        // Capped because Pendo limits the size of an event's properties.
        errorMessage: message.slice(0, 100),
        // Only HTTP errors carry a status; it is absent when the API is unreachable.
        ...(e instanceof ApiError ? { httpStatus: e.status } : {}),
      });
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
