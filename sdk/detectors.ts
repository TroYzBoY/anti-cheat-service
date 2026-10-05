/**
 * Low-level browser probes used by the SDK session. Everything here runs in
 * the learner's exam tab. Module-level code only captures references — it
 * performs no DOM access, so importing this file is side-effect free.
 */
import type {
  FullscreenRequestResult,
  FullscreenState,
  MultiMonitorSample,
} from "./types";

// Capture immutable references before any user-land code can hot-swap them.
// Used by the MITM heuristic to spot a monkey-patched fetch / XHR, and by
// the SDK itself so its own reports can't be intercepted by a patched fetch.
export const ORIGINAL_FETCH: typeof fetch | null =
  typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
    ? globalThis.fetch
    : null;
const ORIGINAL_XHR_OPEN: typeof XMLHttpRequest.prototype.open | null =
  typeof XMLHttpRequest !== "undefined"
    ? XMLHttpRequest.prototype.open
    : null;
const ORIGINAL_XHR_SEND: typeof XMLHttpRequest.prototype.send | null =
  typeof XMLHttpRequest !== "undefined"
    ? XMLHttpRequest.prototype.send
    : null;

/**
 * Capture timing primitives at load. If the learner later overrides
 * `performance.now` or `Date.now` to defeat the debugger trap, we still have
 * the original implementations.
 */
const ORIG_PERFORMANCE_NOW: () => number =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now.bind(performance)
    : () => Date.now();
const ORIG_DATE_NOW: () => number = Date.now.bind(Date);

export function safeNow(): number {
  try {
    return ORIG_PERFORMANCE_NOW();
  } catch {
    return ORIG_DATE_NOW();
  }
}

export function areTimingPrimitivesTampered(): boolean {
  return (
    typeof performance === "undefined" ||
    typeof performance.now !== "function" ||
    typeof Date.now !== "function"
  );
}

const CHANNEL_NAME = "codequest-exam";

/**
 * BroadcastChannel-based duplicate-tab sentinel.
 *
 * Protocol: when a tab enters the active exam phase it broadcasts `ping`.
 * Any tab that is *already* active responds with `pong`. A tab that receives
 * a `pong` knows it is the newcomer and self-terminates via `onDuplicate`.
 * Older tabs continue undisturbed.
 *
 * Returns a teardown function. Safe in environments without BroadcastChannel
 * (returns a no-op tear-down and never fires `onDuplicate`).
 */
export function createDuplicateTabSentinel({
  sessionId,
  onDuplicate,
}: {
  sessionId: string;
  onDuplicate: () => void;
}): () => void {
  if (typeof BroadcastChannel === "undefined") {
    return () => undefined;
  }

  const channel = new BroadcastChannel(CHANNEL_NAME);
  let fired = false;

  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: string; sessionId?: string } | null;
    if (!data || typeof data.type !== "string") return;

    if (data.type === "ping") {
      // An older tab announcing itself? Reply so the newer one knows we're here.
      channel.postMessage({ type: "pong", sessionId });
      return;
    }

    if (data.type === "pong" && !fired) {
      fired = true;
      onDuplicate();
    }
  };

  channel.addEventListener("message", handler);
  channel.postMessage({ type: "ping", sessionId });

  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}

/**
 * Multi-monitor heuristic. Reads `screen.isExtended` (Multi-Screen API,
 * Chromium 100+) and an availWidth-vs-outerWidth delta.
 */
export function detectMultiMonitor(): MultiMonitorSample {
  if (typeof window === "undefined" || typeof window.screen === "undefined") {
    return { extended: false, availWidthRatio: 1, suspicious: false };
  }

  const extended = Boolean(
    (window.screen as Screen & { isExtended?: boolean }).isExtended,
  );

  const availWidth = window.screen.availWidth || window.screen.width || 0;
  const outerWidth = window.outerWidth || availWidth;
  const ratio = outerWidth > 0 ? availWidth / outerWidth : 1;

  // A learner with a single monitor sees `availWidth ≈ outerWidth` (ratio
  // close to 1). With a second monitor extended horizontally the OS reports
  // a much larger availWidth → ratio rises above 1.4 in practice.
  const suspicious = extended || ratio > 1.4;

  return { extended, availWidthRatio: ratio, suspicious };
}

/**
 * Detects whether `fetch` / `XHR` look monkey-patched. A boolean alone is
 * deliberate — it's a tamper flag, not a fine-grained diagnostic.
 */
export function isNetworkApiTampered(): boolean {
  if (typeof globalThis === "undefined") return false;

  if (ORIGINAL_FETCH && globalThis.fetch !== ORIGINAL_FETCH) return true;
  if (typeof XMLHttpRequest === "undefined") return false;

  if (
    ORIGINAL_XHR_OPEN &&
    XMLHttpRequest.prototype.open !== ORIGINAL_XHR_OPEN
  ) {
    return true;
  }
  if (
    ORIGINAL_XHR_SEND &&
    XMLHttpRequest.prototype.send !== ORIGINAL_XHR_SEND
  ) {
    return true;
  }

  // A toString that no longer reports "[native code]" is a strong tell.
  if (ORIGINAL_FETCH) {
    try {
      const src = Function.prototype.toString.call(globalThis.fetch);
      if (!src.includes("[native code]")) return true;
    } catch {
      return true;
    }
  }

  return false;
}

/**
 * Detects an overlay attack: an extension or injected script reducing
 * `body` opacity / applying a filter so the learner can see hidden content.
 */
export function isBodyVisuallyTampered(): boolean {
  if (typeof document === "undefined" || !document.body) return false;

  const style = window.getComputedStyle(document.body);
  const opacity = Number.parseFloat(style.opacity);
  if (!Number.isNaN(opacity) && opacity < 0.95) return true;

  const filter = style.filter;
  if (filter && filter !== "none") return true;

  const backdrop = style.backdropFilter;
  if (backdrop && backdrop !== "none") return true;

  return false;
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function getFullscreenState(): FullscreenState {
  if (typeof document === "undefined") {
    return { active: false, supported: false };
  }

  const doc = document as FullscreenDocument;
  const root = document.documentElement as FullscreenElement;
  const requestFullscreen =
    root.requestFullscreen ?? root.webkitRequestFullscreen;
  const enabled =
    doc.fullscreenEnabled !== false && doc.webkitFullscreenEnabled !== false;

  return {
    active: Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement),
    supported: enabled && typeof requestFullscreen === "function",
  };
}

/** Must be called from a user gesture (click handler). */
export async function requestFullscreen(): Promise<FullscreenRequestResult> {
  const state = getFullscreenState();
  if (!state.supported || state.active) {
    return { state, blocked: false };
  }

  const el = document.documentElement as FullscreenElement;
  const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!request) return { state, blocked: true };

  try {
    await request.call(el);
    return { state: { supported: true, active: true }, blocked: false };
  } catch {
    // User gesture required, denied, or unsupported.
    return { state: getFullscreenState(), blocked: true };
  }
}

export function watchFullscreen(
  listener: (state: FullscreenState) => void,
): () => void {
  const onChange = () => listener(getFullscreenState());
  onChange();
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
}

/**
 * Element-level clipboard / drag-and-drop block. Defence in depth for rich
 * editors (Monaco) whose own handlers could otherwise re-introduce text the
 * learner copied before entering the exam.
 */
export function hardenElement(element: HTMLElement): () => void {
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const events = ["copy", "cut", "paste", "drop", "dragover", "contextmenu"];
  for (const name of events) element.addEventListener(name, stop, true);
  return () => {
    for (const name of events) element.removeEventListener(name, stop, true);
  };
}

const ZOOM_KEYS = new Set(["+", "-", "=", "_", "0", "Add", "Subtract"]);
const ZOOM_CODES = new Set([
  "Equal",
  "Minus",
  "Digit0",
  "NumpadAdd",
  "NumpadSubtract",
  "Numpad0",
]);

/**
 * Window-level input lockdown for the active exam: DevTools shortcuts,
 * browser zoom, clipboard and the context menu. Returns a teardown.
 */
export function installInputBlockers(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    // Block DevTools shortcuts: F12, Ctrl+Shift+C/I/J/K, Ctrl+U
    if (e.key === "F12") {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "c" || k === "i" || k === "j" || k === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "u") {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (ZOOM_KEYS.has(e.key) || ZOOM_CODES.has(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // Block clipboard shortcuts
      const k = e.key.toLowerCase();
      if (k === "c" || k === "v" || k === "x" || k === "a") {
        e.preventDefault();
      }
    }
  };
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const prevent = (e: Event) => e.preventDefault();

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  window.addEventListener("paste", prevent, true);
  window.addEventListener("copy", prevent, true);
  window.addEventListener("cut", prevent, true);
  window.addEventListener("contextmenu", prevent, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("paste", prevent, true);
    window.removeEventListener("copy", prevent, true);
    window.removeEventListener("cut", prevent, true);
    window.removeEventListener("contextmenu", prevent, true);
  };
}

/**
 * Pointer lock hides the system cursor and makes the answer UI unusable;
 * release any lock an earlier build of the exam page may have left attached.
 */
export function releasePointerLock(): void {
  const doc = document as Document & {
    exitPointerLock?: () => void;
    pointerLockElement?: Element | null;
  };
  if (doc.pointerLockElement && typeof doc.exitPointerLock === "function") {
    try {
      doc.exitPointerLock();
    } catch {
      /* best-effort cleanup */
    }
  }
}
