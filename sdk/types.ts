/**
 * Public contract of `window.CodeQuestAntiCheat`. The exam page in the main
 * CodeQuest repo mirrors these types in `lib/exam/anti-cheat-sdk.ts` — keep
 * the two in sync and bump `SDK_VERSION` (lib/policy.ts) on breaking changes.
 */
import type { TerminationReason } from "../lib/policy";

export type FullscreenState = { active: boolean; supported: boolean };

export type FullscreenRequestResult = {
  state: FullscreenState;
  /** True when the browser refused the request (no user gesture, denied). */
  blocked: boolean;
};

export type MultiMonitorSample = {
  extended: boolean;
  availWidthRatio: number;
  suspicious: boolean;
};

export type FocusVia = "window-blur" | "tab-hidden";

export type Termination = {
  /** `session-terminated` = the server already ended this session. */
  reason: TerminationReason | "session-terminated";
  message: string;
};

export type SessionOptions = {
  sessionId: string;
  /** Short-lived JWT issued by the main app's `POST /api/exam/start`. */
  token: string;
  /** Override the service origin (defaults to the origin the SDK loaded from). */
  serviceUrl?: string;
  onTerminate: (termination: Termination) => void;
  /** Every raw blur / hidden event, before de-duplication. */
  onFocusEvent?: (via: FocusVia) => void;
  /** A counted focus loss that did not (yet) end the exam. */
  onFocusLoss?: (event: { via: FocusVia; count: number; limit: number }) => void;
  /** A counted fullscreen exit that did not (yet) end the exam. */
  onFullscreenExit?: (event: { count: number; limit: number }) => void;
  onMultiMonitor?: (sample: MultiMonitorSample) => void;
};

export type AntiCheatSession = {
  /** Start every active-phase monitor. Idempotent. */
  arm(): void;
  /** Stop the monitors but keep the counters (e.g. while submitting). */
  disarm(): void;
  /** Disarm for good. */
  destroy(): void;
  readonly terminated: boolean;
};

export type AntiCheatSdk = {
  version: number;
  policy: { maxFocusLosses: number; maxFullscreenExits: number };
  getFullscreenState(): FullscreenState;
  requestFullscreen(): Promise<FullscreenRequestResult>;
  /** Calls `listener` immediately and on every change; returns a teardown. */
  watchFullscreen(listener: (state: FullscreenState) => void): () => void;
  detectMultiMonitor(): MultiMonitorSample;
  /** Block copy / cut / paste / drop / context menu inside `element`. */
  hardenElement(element: HTMLElement): () => void;
  createSession(options: SessionOptions): AntiCheatSession;
};
