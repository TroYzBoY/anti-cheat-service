import {
  MAX_FOCUS_LOSSES,
  MAX_FULLSCREEN_EXITS,
  isTerminationReason,
  type IntegrityEventType,
  type TerminationReason,
} from "../lib/policy";
import {
  ORIGINAL_FETCH,
  areTimingPrimitivesTampered,
  createDuplicateTabSentinel,
  detectMultiMonitor,
  getFullscreenState,
  installInputBlockers,
  isBodyVisuallyTampered,
  isNetworkApiTampered,
  releasePointerLock,
  safeNow,
} from "./detectors";
import type {
  AntiCheatSession,
  FocusVia,
  SessionOptions,
  Termination,
} from "./types";

const DEVTOOLS_SIZE_POLL_MS = 1_000;
const DEVTOOLS_SIZE_THRESHOLD_PX = 160;
const DEBUGGER_TRAP_INTERVAL_MS = 2_500;
const DEBUGGER_TRAP_THRESHOLD_MS = 120;
const TAMPER_WATCHDOG_INTERVAL_MS = 5_000;
const REPORT_RETRY_DELAYS_MS = [1_000, 3_000];

const TERMINATION_MESSAGES: Record<Termination["reason"], string> = {
  devtools: "DevTools detected. Exam cancelled.",
  "focus-loss-limit": `Too many tab switches (${MAX_FOCUS_LOSSES}/${MAX_FOCUS_LOSSES}). Exam banned.`,
  "fullscreen-exit-limit": `Exited fullscreen ${MAX_FULLSCREEN_EXITS} times. Exam terminated.`,
  "duplicate-tab":
    "This exam session is already open in another tab. The newer tab was closed.",
  "fetch-mitm": "Network API tampered with. Exam cancelled.",
  "overlay-tampered":
    "Page tampered with (overlay or filter detected). Exam cancelled.",
  screenshot: "Screenshot (Print Screen) attempt detected. Exam cancelled.",
  "session-terminated": "This exam session has already been terminated.",
};

type EventVerdict = {
  ok?: boolean;
  active?: boolean;
  status?: string;
  terminated?: unknown;
};

type ReportPayload = {
  type: IntegrityEventType;
  clientCount?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSession(
  options: SessionOptions,
  defaultServiceUrl: string,
): AntiCheatSession {
  const endpoint = new URL(
    "/api/v1/events",
    options.serviceUrl ?? defaultServiceUrl,
  ).toString();
  const doFetch = ORIGINAL_FETCH ?? globalThis.fetch;

  let armed = false;
  let destroyed = false;
  let terminated = false;
  let focusAway = false;
  let focusLosses = 0;
  let fullscreenExits = 0;
  let multiMonitorReported = false;
  let teardowns: (() => void)[] = [];

  async function send(payload: ReportPayload): Promise<EventVerdict | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await doFetch.call(globalThis, endpoint, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.token}`,
          },
          body: JSON.stringify(payload),
        });
        // 4xx is a definitive answer (bad token, wrong owner, cap hit) —
        // retrying won't change it.
        if (res.ok || res.status < 500) {
          return (await res.json().catch(() => null)) as EventVerdict | null;
        }
      } catch {
        /* offline / transient — fall through to retry */
      }
      const delay = REPORT_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) return null;
      await wait(delay);
    }
  }

  function end(reason: Termination["reason"], message?: string) {
    if (terminated) return;
    terminated = true;
    disarm();
    options.onTerminate({
      reason,
      message: message ?? TERMINATION_MESSAGES[reason],
    });
  }

  function report(payload: ReportPayload) {
    void send(payload).then((verdict) => {
      if (!verdict || verdict.ok !== true) return;
      if (isTerminationReason(verdict.terminated)) {
        end(verdict.terminated);
      } else if (verdict.active === false && verdict.status === "TERMINATED") {
        end("session-terminated");
      }
    });
  }

  /** Termination-grade signal: end locally first, then tell the service. */
  function fatal(
    type: IntegrityEventType,
    reason: TerminationReason,
    message: string,
    metadata?: ReportPayload["metadata"],
  ) {
    if (!armed || terminated) return;
    end(reason, message);
    report({ type, metadata });
  }

  function registerFocusLoss(via: FocusVia) {
    options.onFocusEvent?.(via);
    if (focusAway || terminated) return;
    focusAway = true;

    focusLosses = Math.min(MAX_FOCUS_LOSSES, focusLosses + 1);
    const count = focusLosses;
    report({ type: "focus-loss", clientCount: count, metadata: { via } });

    if (count >= MAX_FOCUS_LOSSES) {
      end("focus-loss-limit");
      return;
    }
    options.onFocusLoss?.({ via, count, limit: MAX_FOCUS_LOSSES });
  }

  function registerFullscreenExit() {
    if (terminated) return;
    fullscreenExits += 1;
    const count = fullscreenExits;
    report({ type: "fullscreen-exit", clientCount: count });

    if (count >= MAX_FULLSCREEN_EXITS) {
      end("fullscreen-exit-limit");
      return;
    }
    options.onFullscreenExit?.({ count, limit: MAX_FULLSCREEN_EXITS });
  }

  function watchFocus(): () => void {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        registerFocusLoss("tab-hidden");
      } else if (document.hasFocus()) {
        focusAway = false;
      }
    };
    const onBlur = () => registerFocusLoss("window-blur");
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        focusAway = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }

  function watchFullscreenExits(): () => void {
    const onChange = () => {
      const state = getFullscreenState();
      if (state.supported && !state.active) registerFullscreenExit();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }

  // DevTools detection #1: a docked DevTools panel shrinks the viewport.
  function watchWindowSize(): () => void {
    let consecutiveHits = 0;
    const id = window.setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (
        widthDiff > DEVTOOLS_SIZE_THRESHOLD_PX ||
        heightDiff > DEVTOOLS_SIZE_THRESHOLD_PX
      ) {
        consecutiveHits += 1;
        if (consecutiveHits >= 2) {
          fatal("devtools", "devtools", TERMINATION_MESSAGES.devtools, {
            method: "window-size",
          });
        }
      } else {
        consecutiveHits = 0;
      }
    }, DEVTOOLS_SIZE_POLL_MS);
    return () => window.clearInterval(id);
  }

  // DevTools detection #2: time a `debugger` statement using the timing
  // reference captured at SDK load. With DevTools open and "pause on
  // debugger" enabled the statement pauses; in most other DevTools
  // configurations the engine still slows the call noticeably.
  function watchDebuggerTrap(): () => void {
    let consecutive = 0;
    const id = window.setInterval(() => {
      const start = safeNow();
      try {
        debugger;
      } catch {
        /* no-op */
      }
      const elapsed = safeNow() - start;

      // A hot-swapped timing primitive is a strong cheat signal on its own.
      if (areTimingPrimitivesTampered()) {
        fatal(
          "devtools",
          "devtools",
          "Timing primitives tampered with. Exam cancelled.",
          { method: "timing-tampered" },
        );
        return;
      }

      if (elapsed > DEBUGGER_TRAP_THRESHOLD_MS) {
        consecutive += 1;
        if (consecutive >= 2) {
          fatal(
            "devtools",
            "devtools",
            "DevTools detected (debugger trap). Exam cancelled.",
            { method: "debugger-trap" },
          );
        }
      } else {
        consecutive = 0;
      }
    }, DEBUGGER_TRAP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }

  // Monkey-patched fetch/XHR or an overlay attack. Both are termination-grade:
  // the only legitimate cause is an extension the learner could have
  // disabled beforehand.
  function watchTampering(): () => void {
    const id = window.setInterval(() => {
      if (isNetworkApiTampered()) {
        fatal("fetch-mitm", "fetch-mitm", TERMINATION_MESSAGES["fetch-mitm"]);
        return;
      }
      if (isBodyVisuallyTampered()) {
        fatal(
          "overlay-tampered",
          "overlay-tampered",
          TERMINATION_MESSAGES["overlay-tampered"],
        );
      }
    }, TAMPER_WATCHDOG_INTERVAL_MS);
    return () => window.clearInterval(id);
  }

  function sampleMultiMonitor() {
    const sample = detectMultiMonitor();
    options.onMultiMonitor?.(sample);
    // Banner + log only, never terminate: the learner may legitimately
    // mirror a single display.
    if (sample.suspicious && !multiMonitorReported) {
      multiMonitorReported = true;
      report({
        type: "multi-monitor",
        metadata: {
          extended: sample.extended,
          availWidthRatio: Math.round(sample.availWidthRatio * 100) / 100,
        },
      });
    }
  }

  function arm() {
    if (armed || terminated || destroyed) return;
    armed = true;
    focusAway = false;
    releasePointerLock();
    teardowns = [
      installInputBlockers({
        onPrintScreen: () =>
          fatal("screenshot", "screenshot", TERMINATION_MESSAGES.screenshot),
      }),
      watchFocus(),
      watchFullscreenExits(),
      watchWindowSize(),
      watchDebuggerTrap(),
      watchTampering(),
      createDuplicateTabSentinel({
        sessionId: options.sessionId,
        onDuplicate: () =>
          fatal(
            "duplicate-tab",
            "duplicate-tab",
            TERMINATION_MESSAGES["duplicate-tab"],
          ),
      }),
    ];
    sampleMultiMonitor();
  }

  function disarm() {
    armed = false;
    const pending = teardowns;
    teardowns = [];
    for (const teardown of pending) teardown();
  }

  return {
    arm,
    disarm,
    destroy() {
      destroyed = true;
      disarm();
    },
    get terminated() {
      return terminated;
    },
  };
}
