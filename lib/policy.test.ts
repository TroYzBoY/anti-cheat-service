import { describe, expect, it } from "vitest";

import {
  EVENT_RULES,
  INTEGRITY_EVENT_TYPES,
  MAX_FOCUS_LOSSES,
  MAX_FULLSCREEN_EXITS,
  evaluateEvent,
  getEventLimit,
  isTerminationReason,
  outcomeForReason,
} from "./policy";

describe("anti-cheat policy", () => {
  it("has a rule for every event type", () => {
    for (const type of INTEGRITY_EVENT_TYPES) {
      expect(EVENT_RULES[type]).toBeDefined();
    }
  });

  it("terminates immediately on fatal signals", () => {
    expect(evaluateEvent("devtools", 1)).toBe("devtools");
    expect(evaluateEvent("duplicate-tab", 1)).toBe("duplicate-tab");
    expect(evaluateEvent("fetch-mitm", 1)).toBe("fetch-mitm");
    expect(evaluateEvent("overlay-tampered", 1)).toBe("overlay-tampered");
    expect(evaluateEvent("screenshot", 1)).toBe("screenshot");
  });

  it("only terminates counted signals at the limit", () => {
    expect(evaluateEvent("focus-loss", MAX_FOCUS_LOSSES - 1)).toBeNull();
    expect(evaluateEvent("focus-loss", MAX_FOCUS_LOSSES)).toBe("focus-loss-limit");
    expect(evaluateEvent("fullscreen-exit", MAX_FULLSCREEN_EXITS - 1)).toBeNull();
    expect(evaluateEvent("fullscreen-exit", MAX_FULLSCREEN_EXITS)).toBe(
      "fullscreen-exit-limit",
    );
    expect(getEventLimit("focus-loss")).toBe(MAX_FOCUS_LOSSES);
    expect(getEventLimit("devtools")).toBeNull();
  });

  it("never terminates on multi-monitor", () => {
    expect(evaluateEvent("multi-monitor", 50)).toBeNull();
  });

  it("bans everything except devtools", () => {
    expect(outcomeForReason("devtools")).toBe("TERMINATED");
    expect(outcomeForReason("focus-loss-limit")).toBe("BANNED");
    expect(outcomeForReason("duplicate-tab")).toBe("BANNED");
    expect(outcomeForReason("screenshot")).toBe("BANNED");
  });

  it("recognises termination reasons", () => {
    expect(isTerminationReason("devtools")).toBe(true);
    expect(isTerminationReason("multi-monitor")).toBe(false);
    expect(isTerminationReason(undefined)).toBe(false);
  });
});
