import { describe, expect, it } from "vitest";

import {
  examSebConfigKeys,
  examSebSettings,
  sebConfigFile,
  sebConfigKey,
  sebJson,
  type SebValue,
} from "./seb-config";

/** Excerpt of the SEB-JSON example in SEB's Config Key documentation. */
const OFFICIAL =
  '{"permittedProcesses":[{"active":true,"allowedExecutables":"","allowUserToChooseApp":false,' +
  '"arguments":[],"autostart":true,"description":"","executable":"xulrunner.exe",' +
  '"iconInTaskbar":true,"identifier":"XULRunner","os":1,"path":"../xulrunner/",' +
  '"runInBackground":false,"strongKill":true,"title":"SEB","windowHandlingProcess":""}],' +
  '"proxies":{"HTTPEnable":false,"HTTPPassword":"","HTTPPort":80,"HTTPProxy":"",' +
  '"HTTPRequiresPassword":false,"HTTPSEnable":false,"HTTPSPassword":"","HTTPSPort":443,' +
  '"HTTPSProxy":"","HTTPSRequiresPassword":false,"HTTPSUsername":"","HTTPUsername":""}}';

/** The same value with every dictionary's keys in reverse order. */
function reversed(value: SebValue): SebValue {
  if (Array.isArray(value)) return value.map(reversed);
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reversed(item)]),
  );
}

describe("sebJson", () => {
  it("matches SEB's own serialization, keys sorted case-insensitively", () => {
    expect(sebJson(reversed(JSON.parse(OFFICIAL) as SebValue))).toBe(OFFICIAL);
  });
});

describe("generated .seb", () => {
  const origin = "https://fenrir.example";
  const settings = examSebSettings(origin, "e1");

  it("opens the exam and quits on the quit page", () => {
    expect(settings.startURL).toBe("https://fenrir.example/exams/e1");
    expect(settings.quitURL).toBe("https://fenrir.example/seb-quit");
    const file = sebConfigFile(settings);
    expect(file).toContain("<key>startURL</key>\n  <string>https://fenrir.example/exams/e1</string>");
    expect(file).toContain("<string>chrome.exe</string>");
    expect(file).toContain("<key>createNewDesktop</key>\n  <true/>");
  });

  it("is checked against its own Config Key, per exam, plus custom keys", () => {
    const custom = "c".repeat(64);
    const [generated, ...rest] = examSebConfigKeys(origin, "e1", [custom]);
    expect(generated).toBe(sebConfigKey(settings));
    expect(generated).toMatch(/^[0-9a-f]{64}$/);
    expect(rest).toEqual([custom]);
    expect(examSebConfigKeys(origin, "e2", [])[0]).not.toBe(generated);
  });
});
