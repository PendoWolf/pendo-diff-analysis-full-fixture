import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
// Agent errors are caught so tracking can never make an action look failed.
function trackEvent(name: string, props: TrackProps) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(name, props);
    } catch (e) {
      console.warn("Pendo track failed", e);
    }
  }
}

interface SuccessEvent {
  name: string;
  props: (states: { previous: AppState; next: AppState }) => TrackProps;
}

// Track Event sent once the server confirms each action, and its properties.
// `previous` is the state shown when the action started; `next` is the
// server's response. Names must match the track types registered in Pendo
// exactly (case-sensitive), so don't rename them.
const SUCCESS_EVENTS: Record<Action, SuccessEvent> = {
  load: {
    name: "demo-load",
    props: ({ next }) => ({ counter: next.counter, lastAction: next.lastAction }),
  },
  increment: {
    name: "demo-increment",
    props: ({ previous, next }) => ({ counter: next.counter, previousCounter: previous.counter }),
  },
  decrement: {
    name: "demo-decrement",
    props: ({ previous, next }) => ({ counter: next.counter, previousCounter: previous.counter }),
  },
  // The counter is always 0 after a reset, so report what was cleared.
  reset: {
    name: "demo-reset",
    props: ({ previous }) => ({
      previousCounter: previous.counter,
      previousLastAction: previous.lastAction,
    }),
  },
  refresh: {
    name: "demo-refresh",
    props: ({ previous, next }) => ({
      counter: next.counter,
      previousCounter: previous.counter,
      counterChanged: next.counter !== previous.counter,
      lastAction: next.lastAction,
    }),
  },
};

// Sent when the initial load or any counter action fails. One event with an
// `action` property, so each action's failure rate can be computed against its
// success event above.
const ACTION_FAILED_EVENT = "demo-action-failed";

// Set once the initial load has been tracked for this page load (see the mount
// effect in App).
let initialLoadTracked = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Action, fn: () => Promise<AppState>, track = true) => {
    const previous = state;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      if (track) {
        const event = SUCCESS_EVENTS[action];
        trackEvent(event.name, event.props({ previous, next }));
      }
    } catch (e) {
      setError((e as Error).message);
      if (track) {
        trackEvent(ACTION_FAILED_EVENT, {
          action,
          // Only non-2xx responses have a status; network and CORS failures don't.
          ...(e instanceof ApiError ? { httpStatus: e.status } : {}),
          // Truncated to stay well within Pendo's property size limit.
          errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 200),
        });
      }
    }
  };

  useEffect(() => {
    // StrictMode runs mount effects twice in development. Only the first run's
    // load is tracked, so each page load counts once.
    run("load", api.getState, !initialLoadTracked);
    initialLoadTracked = true;
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
