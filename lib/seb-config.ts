import "server-only";

import crypto from "node:crypto";

import { SEB_QUIT_PATH } from "@/lib/seb-urls";

/**
 * Every exam is taken in Safe Exam Browser with a .seb file this app
 * generates, so the server can work out its Config Key itself
 * (https://safeexambrowser.org/developer/seb-config-key.html).
 */

/** A .seb value (Apple property list). Numbers are always integers here. */
export type SebValue = boolean | number | string | SebValue[] | { [key: string]: SebValue };
export type SebSettings = { [key: string]: SebValue };

const WINDOWS = 1;
const MACOS = 0;

/**
 * Apps SEB makes the learner close before the exam starts, and kills if
 * they start during it. Google Meet and web ChatGPT run in browsers, so
 * other browsers are on the list. SEB for Windows adds its own defaults on
 * top: Discord, Zoom, Teams, Skype, Slack, Telegram, AnyDesk, TeamViewer,
 * OBS, Remote Desktop, Quick Assist and more.
 */
const WINDOWS_CLOSE_FIRST = [
  "chrome.exe",
  "msedge.exe",
  "firefox.exe",
  "opera.exe",
  "brave.exe",
  "vivaldi.exe",
  "Arc.exe",
  "WhatsApp.exe",
  "Messenger.exe",
  "Viber.exe",
  "Signal.exe",
];

/** Killed without asking: AI assistants, overlays and screen recorders. */
const WINDOWS_KILL = [
  "ChatGPT.exe",
  "Claude.exe",
  "Copilot.exe",
  "Perplexity.exe",
  "Cluely.exe",
  "Interview Coder.exe",
  "GameBar.exe",
  "NVIDIA Share.exe",
  "GameOverlayUI.exe",
  "ShareX.exe",
  "bdcam.exe",
];

/** [process name, bundle identifier] */
const MACOS_CLOSE_FIRST: [string, string][] = [
  ["Google Chrome", "com.google.Chrome"],
  ["Microsoft Edge", "com.microsoft.edgemac"],
  ["firefox", "org.mozilla.firefox"],
  ["Safari", "com.apple.Safari"],
  ["Brave Browser", "com.brave.Browser"],
  ["Arc", "company.thebrowser.Browser"],
  ["Opera", "com.operasoftware.Opera"],
  ["Discord", "com.hnc.Discord"],
  ["zoom.us", "us.zoom.xos"],
  ["Microsoft Teams", "com.microsoft.teams2"],
  ["Slack", "com.tinyspeck.slackmacgap"],
  ["Telegram", "ru.keepcoder.Telegram"],
  ["WhatsApp", "net.whatsapp.WhatsApp"],
  ["FaceTime", "com.apple.FaceTime"],
  ["Messages", "com.apple.MobileSMS"],
];

const MACOS_KILL: [string, string][] = [
  ["ChatGPT", "com.openai.chat"],
  ["Claude", "com.anthropic.claudefordesktop"],
  ["Perplexity", "ai.perplexity.mac"],
  ["AnyDesk", "com.philandro.anydesk"],
  ["TeamViewer", "com.teamviewer.TeamViewer"],
  ["OBS", "com.obsproject.obs-studio"],
];

const windowsApp = (strongKill: boolean) => (executable: string) => ({
  active: true,
  executable,
  os: WINDOWS,
  strongKill,
});

const macApp =
  (strongKill: boolean) =>
  ([executable, identifier]: [string, string]) => ({
    active: true,
    executable,
    identifier,
    os: MACOS,
    strongKill,
  });

export function examSebSettings(origin: string, examId: string): SebSettings {
  return {
    startURL: `${origin}/exams/${examId}`,
    // "Starting an exam": the settings last for this SEB session only.
    sebConfigPurpose: 0,
    // Config Key hash in a request header, and the JavaScript API in the
    // modern WebView on macOS/iOS.
    sendBrowserExamKey: true,
    browserWindowWebView: 3,
    // Kiosk: SEB's own desktop, where no other app's window or overlay shows.
    createNewDesktop: true,
    // No SEB taskbar: clicking it takes focus from the exam, which bans.
    // Learners leave through the quit link instead.
    showTaskBar: false,
    allowQuit: true,
    quitURL: `${origin}${SEB_QUIT_PATH}`,
    // Also hides SEB from screen capture and blocks remote desktop sessions.
    allowScreenSharing: false,
    allowVirtualMachine: false,
    enablePrintScreen: false,
    allowedDisplaysMaxNumber: 1,
    allowDisplayMirroring: false,
    allowSiri: false,
    allowDictation: false,
    allowSpellCheck: false,
    allowDownUploads: false,
    allowPreferencesWindow: false,
    enableRightMouse: false,
    monitorProcesses: true,
    prohibitedProcesses: [
      ...WINDOWS_CLOSE_FIRST.map(windowsApp(false)),
      ...WINDOWS_KILL.map(windowsApp(true)),
      ...MACOS_CLOSE_FIRST.map(macApp(false)),
      ...MACOS_KILL.map(macApp(true)),
    ],
  };
}

const byKeyIgnoringCase = (a: string, b: string) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * SEB's "SEB-JSON": dictionary keys sorted case-insensitively at every level,
 * no whitespace, strings not escaped. The spec's special cases (<data>,
 * <date>, <real>, empty dictionaries, originatorVersion) never occur in
 * settings built here.
 */
export function sebJson(value: SebValue): string {
  if (Array.isArray(value)) return `[${value.map(sebJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort(byKeyIgnoringCase)
      .map((key) => `"${key}":${sebJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return typeof value === "string" ? `"${value}"` : String(value);
}

/** The Config Key SEB computes for these settings (64 lowercase hex). */
export function sebConfigKey(settings: SebSettings) {
  return crypto.createHash("sha256").update(sebJson(settings), "utf8").digest("hex");
}

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function plist(value: SebValue, indent: string): string {
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    return `${indent}<array>\n${value.map((item) => plist(item, inner)).join("")}${indent}</array>\n`;
  }
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort(byKeyIgnoringCase)
      .map((key) => `${inner}<key>${escapeXml(key)}</key>\n${plist(value[key], inner)}`);
    return `${indent}<dict>\n${entries.join("")}${indent}</dict>\n`;
  }
  if (typeof value === "boolean") return `${indent}<${value}/>\n`;
  if (typeof value === "number") return `${indent}<integer>${value}</integer>\n`;
  return `${indent}<string>${escapeXml(value)}</string>\n`;
}

/** The unencrypted .seb file (plist XML) for these settings. */
export function sebConfigFile(settings: SebSettings) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n' +
    plist(settings, "") +
    "</plist>\n"
  );
}

/**
 * Config Keys SEB may present for this exam: the generated .seb file's, plus
 * any an admin pasted for a .seb file of their own.
 */
export function examSebConfigKeys(origin: string, examId: string, customKeys: string[]) {
  return [sebConfigKey(examSebSettings(origin, examId)), ...customKeys];
}
