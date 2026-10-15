import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event with its properties. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: string, props: TrackProps) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(name, props);
    } catch {
      // Analytics must never break the app or be reported as a failed action.
    }
  }
}

// Fired once an action's request succeeded and its result is on screen. `before`
// is the state the visitor saw when they triggered it; `after` is what the API
// returned. Event names are registered in Pendo (and asserted in tests), so keep
// them exactly as written.
function trackSuccess(action: Action, before: AppState, after: AppState) {
  switch (action) {
    case "load":
      trackEvent("demo-load", { counter: after.counter, lastAction: after.lastAction });
      break;
    case "increment":
      trackEvent("demo-increment", { counter: after.counter, previousCounter: before.counter });
      break;
    case "decrement":
      trackEvent("demo-decrement", { counter: after.counter, previousCounter: before.counter });
      break;
    case "reset":
      // counter is always 0 afterwards, so record what was cleared instead.
      trackEvent("demo-reset", { previousCounter: before.counter, previousLastAction: before.lastAction });
      break;
    case "refresh":
      // The counter is shared by every visitor; counterChanged shows whether the
      // refresh picked up a change made in another session.
      trackEvent("demo-refresh", {
        counter: after.counter,
        lastAction: after.lastAction,
        previousCounter: before.counter,
        counterChanged: after.counter !== before.counter,
      });
      break;
  }
}

// Fired when any action's request fails; `action` says which one. method, path
// and httpStatus come from ApiError. httpStatus is only set when the server
// responded, so network/CORS errors are the failures without one.
function trackFailure(action: Action, e: unknown) {
  const props: TrackProps = {
    action,
    errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 100),
  };
  if (e instanceof ApiError) {
    props.method = e.method;
    props.path = e.path;
    if (e.httpStatus !== undefined) props.httpStatus = e.httpStatus;
  }
  trackEvent("demo-action-failed", props);
}

// React StrictMode runs the mount effect twice in development, so the initial
// load runs twice there. This flag is module-level (it survives that remount) and
// keeps tracking of the initial load, success or failure, to once per page.
let initialLoadTracked = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Action, fn: () => Promise<AppState>) => {
    const before = state;
    const shouldTrack = action !== "load" || !initialLoadTracked;
    if (action === "load") initialLoadTracked = true;
    try {
      setError(null);
      const after = await fn();
      setState(after);
      if (shouldTrack) trackSuccess(action, before, after);
    } catch (e) {
      setError((e as Error).message);
      if (shouldTrack) trackFailure(action, e);
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
