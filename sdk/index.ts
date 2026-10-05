/**
 * CodeQuest anti-cheat browser SDK.
 *
 * Bundled by `scripts/build-sdk.mjs` into `public/sdk/v1.js` and loaded by
 * the exam page with a plain <script> tag; exposes `window.CodeQuestAntiCheat`.
 *
 * Detection has to run in the learner's tab (DevTools, focus and fullscreen
 * are only observable there). Every violation is reported to this service's
 * `POST /api/v1/events`, which records it in the shared database and ends the
 * exam session server-side — the exam page can't talk its way out of it.
 */
import {
  MAX_FOCUS_LOSSES,
  MAX_FULLSCREEN_EXITS,
  SDK_VERSION,
} from "../lib/policy";
import {
  detectMultiMonitor,
  getFullscreenState,
  hardenElement,
  requestFullscreen,
  watchFullscreen,
} from "./detectors";
import { createSession } from "./session";
import type { AntiCheatSdk } from "./types";

declare global {
  interface Window {
    CodeQuestAntiCheat?: AntiCheatSdk;
  }
}

// `currentScript` is only set while this file is first executing, so read it
// now: the SDK reports back to whichever origin served it.
const currentScript = document.currentScript as HTMLScriptElement | null;
const SERVICE_ORIGIN = currentScript?.src
  ? new URL(currentScript.src).origin
  : window.location.origin;

const sdk: AntiCheatSdk = {
  version: SDK_VERSION,
  policy: {
    maxFocusLosses: MAX_FOCUS_LOSSES,
    maxFullscreenExits: MAX_FULLSCREEN_EXITS,
  },
  getFullscreenState,
  requestFullscreen,
  watchFullscreen,
  detectMultiMonitor,
  hardenElement,
  createSession: (options) => createSession(options, SERVICE_ORIGIN),
};

window.CodeQuestAntiCheat = Object.freeze(sdk);
