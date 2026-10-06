/**
 * Single source of truth for the anti-cheat policy. Imported by both the
 * browser SDK bundle (`sdk/`) and the server-side enforcement
 * (`lib/enforcement.ts`), so the client fallback and the server verdict can
 * never disagree. Must stay free of server-only and DOM-only imports.
 */

/** Bump when the SDK's public contract changes; the exam page checks it. */
export const SDK_VERSION = 1;

export const MAX_FOCUS_LOSSES = 3;
export const MAX_FULLSCREEN_EXITS = 3;

/** Every signal the SDK may report to `POST /api/v1/events`. */
export const INTEGRITY_EVENT_TYPES = [
  "focus-loss",
  "fullscreen-exit",
  "devtools",
  "duplicate-tab",
  "fetch-mitm",
  "overlay-tampered",
  "multi-monitor",
  "screenshot",
] as const;

export type IntegrityEventType = (typeof INTEGRITY_EVENT_TYPES)[number];

export const TERMINATION_REASONS = [
  "devtools",
  "focus-loss-limit",
  "fullscreen-exit-limit",
  "duplicate-tab",
  "fetch-mitm",
  "overlay-tampered",
  "screenshot",
] as const;

export type TerminationReason = (typeof TERMINATION_REASONS)[number];

type EventRule =
  /** Ends the exam on the first occurrence. */
  | { kind: "terminate"; reason: TerminationReason }
  /** Ends the exam once the per-session count reaches `limit`. */
  | { kind: "counted"; limit: number; reason: TerminationReason }
  /** Recorded for proctor review only. */
  | { kind: "log" };

export const EVENT_RULES: Record<IntegrityEventType, EventRule> = {
  "focus-loss": {
    kind: "counted",
    limit: MAX_FOCUS_LOSSES,
    reason: "focus-loss-limit",
  },
  "fullscreen-exit": {
    kind: "counted",
    limit: MAX_FULLSCREEN_EXITS,
    reason: "fullscreen-exit-limit",
  },
  devtools: { kind: "terminate", reason: "devtools" },
  "duplicate-tab": { kind: "terminate", reason: "duplicate-tab" },
  "fetch-mitm": { kind: "terminate", reason: "fetch-mitm" },
  "overlay-tampered": { kind: "terminate", reason: "overlay-tampered" },
  "multi-monitor": { kind: "log" },
  // The Print Screen key. Pages can't stop the OS from capturing the screen,
  // so pressing it is treated as an attempt to copy the questions.
  screenshot: { kind: "terminate", reason: "screenshot" },
};

/**
 * Reasons that mark the `ExamAttempt` as BANNED rather than TERMINATED.
 * DevTools stays a plain termination: it also trips on accidental F12 /
 * docked-panel resizes, so it shouldn't carry the ban stigma.
 */
const BAN_REASONS: ReadonlySet<TerminationReason> = new Set([
  "focus-loss-limit",
  "fullscreen-exit-limit",
  "duplicate-tab",
  "fetch-mitm",
  "overlay-tampered",
  "screenshot",
]);

export function outcomeForReason(
  reason: TerminationReason,
): "BANNED" | "TERMINATED" {
  return BAN_REASONS.has(reason) ? "BANNED" : "TERMINATED";
}

export function isTerminationReason(value: unknown): value is TerminationReason {
  return (
    typeof value === "string" &&
    (TERMINATION_REASONS as readonly string[]).includes(value)
  );
}

export function getEventLimit(type: IntegrityEventType): number | null {
  const rule = EVENT_RULES[type];
  return rule.kind === "counted" ? rule.limit : null;
}

/**
 * Decide whether an event ends the exam. `count` is how many events of this
 * type the session has accumulated, including the one being evaluated.
 */
export function evaluateEvent(
  type: IntegrityEventType,
  count: number,
): TerminationReason | null {
  const rule = EVENT_RULES[type];
  if (rule.kind === "terminate") return rule.reason;
  if (rule.kind === "counted" && count >= rule.limit) return rule.reason;
  return null;
}
