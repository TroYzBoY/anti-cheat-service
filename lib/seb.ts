import "server-only";

import crypto from "node:crypto";

/**
 * Safe Exam Browser proves which configuration it is running with
 * SHA-256(URL + Config Key), where the Config Key is a hash of the .seb
 * settings (shown in SEB Config Tool). It sends that hash for each request in
 * the `X-SafeExamBrowser-ConfigKeyHash` header, and exposes it to the page as
 * `SafeExamBrowser.security.configKey` (hashed with the page URL), which the
 * exam page forwards as `proof`. Either one is accepted.
 */
export const SEB_CONFIG_KEY_HEADER = "x-safeexambrowser-configkeyhash";

export type SebProof = { configKeyHash?: unknown; url?: unknown } | null | undefined;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const withoutFragment = (url: string) => url.split("#")[0];

function matches(hash: string, url: string, keys: string[]) {
  const expected = Buffer.from(hash.toLowerCase(), "utf8");
  return keys.some((key) => {
    const actual = Buffer.from(sha256(withoutFragment(url) + key.toLowerCase()), "utf8");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
}

export function hasValidSebProof({
  configKeys,
  request,
  proof,
}: {
  configKeys: string[];
  request: Request;
  proof: SebProof;
}): boolean {
  if (configKeys.length === 0) return false;

  const header = request.headers.get(SEB_CONFIG_KEY_HEADER);
  if (header && matches(header, request.url, configKeys)) return true;

  const hash = typeof proof?.configKeyHash === "string" ? proof.configKeyHash : null;
  const url = typeof proof?.url === "string" ? proof.url : null;
  if (!hash || !url) return false;
  try {
    // The page URL it was hashed with must be one of ours.
    if (new URL(url).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }
  return matches(hash, url, configKeys);
}

/** Exported for tests: what SEB sends for `url` under `configKey`. */
export function sebHashFor(url: string, configKey: string) {
  return sha256(withoutFragment(url) + configKey.toLowerCase());
}
