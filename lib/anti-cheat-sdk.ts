import { SDK_VERSION } from "@/lib/policy";
import type { AntiCheatSdk } from "@/sdk/types";

let pending: Promise<AntiCheatSdk> | null = null;

/**
 * Inject this app's own `/sdk/v<N>.js` once and resolve with
 * `window.CodeQuestAntiCheat`. Rejects when the script can't load (blocked by
 * an extension) or is a different version; a later call retries.
 */
export function loadAntiCheatSdk(): Promise<AntiCheatSdk> {
  const loaded = window.CodeQuestAntiCheat;
  if (loaded && loaded.version === SDK_VERSION) return Promise.resolve(loaded);
  if (pending) return pending;

  const script = document.createElement("script");
  script.src = `/sdk/v${SDK_VERSION}.js`;
  script.async = true;

  pending = new Promise<AntiCheatSdk>((resolve, reject) => {
    script.onload = () => {
      const sdk = window.CodeQuestAntiCheat;
      if (sdk && sdk.version === SDK_VERSION) resolve(sdk);
      else reject(new Error("Хамгаалалтын модулийн хувилбар таарахгүй байна."));
    };
    script.onerror = () =>
      reject(
        new Error(
          "Хамгаалалтын модулийг ачаалж чадсангүй. Ad/script blocker-оо унтраагаад дахин оролдоно уу.",
        ),
      );
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    pending = null;
    script.remove();
    throw error;
  });

  return pending;
}
