"use client";

import { useSyncExternalStore } from "react";

import { SEB_QUIT_PATH } from "@/lib/seb-urls";

/** Safe Exam Browser's JavaScript API (SEB 3.x on Windows, macOS, iOS). */
type SebApi = {
  security?: { configKey?: string; updateKeys?: (callback: () => void) => void };
};

function sebApi(): SebApi | undefined {
  return (window as Window & { SafeExamBrowser?: SebApi }).SafeExamBrowser;
}

function detectSeb() {
  return Boolean(sebApi()) || /\bSEB\//.test(navigator.userAgent);
}

const noSubscribe = () => () => undefined;

/** Whether the page runs in Safe Exam Browser. False on the server. */
export function useInSeb() {
  return useSyncExternalStore(noSubscribe, detectSeb, () => false);
}

/**
 * What the server checks to confirm Safe Exam Browser: SEB's Config Key hash
 * for this page URL. `updateKeys` refreshes it after client-side navigation.
 */
export async function sebProof(): Promise<{ configKeyHash: string; url: string } | null> {
  const security = sebApi()?.security;
  if (!security) return null;
  if (security.updateKeys) {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 2000);
      security.updateKeys!(() => {
        window.clearTimeout(timeout);
        resolve();
      });
    });
  }
  return typeof security.configKey === "string"
    ? { configKeyHash: security.configKey, url: window.location.href.split("#")[0] }
    : null;
}

/**
 * The way out of Safe Exam Browser, whose taskbar (and quit button) the
 * generated .seb file hides. Renders nothing in other browsers.
 */
export function SebQuitLink({ className }: { className: string }) {
  const inSeb = useInSeb();
  if (!inSeb) return null;
  return (
    // A full page load, so SEB sees its quit URL.
    <a href={SEB_QUIT_PATH} className={className}>
      ⏻ SEB-ээс гарах
    </a>
  );
}
