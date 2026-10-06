import { describe, expect, it } from "vitest";

import { hasValidSebProof, sebHashFor, SEB_CONFIG_KEY_HEADER } from "./seb";

const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);
const API = "https://fenrir.example/api/exams/e1/start";
const PAGE = "https://fenrir.example/exams/e1";

const request = (headers: Record<string, string> = {}) =>
  new Request(API, { method: "POST", headers });

describe("hasValidSebProof", () => {
  it("accepts the header hash for this request URL", () => {
    const req = request({ [SEB_CONFIG_KEY_HEADER]: sebHashFor(API, KEY) });
    expect(hasValidSebProof({ configKeys: [OTHER, KEY], request: req, proof: null })).toBe(true);
  });

  it("accepts the JavaScript API hash for one of our pages", () => {
    const proof = { configKeyHash: sebHashFor(PAGE, KEY), url: `${PAGE}#top` };
    expect(hasValidSebProof({ configKeys: [KEY], request: request(), proof })).toBe(true);
  });

  it("rejects other configs, other origins and missing proof", () => {
    const wrongKey = { configKeyHash: sebHashFor(PAGE, OTHER), url: PAGE };
    expect(hasValidSebProof({ configKeys: [KEY], request: request(), proof: wrongKey })).toBe(false);

    const evil = "https://evil.example/exams/e1";
    const foreign = { configKeyHash: sebHashFor(evil, KEY), url: evil };
    expect(hasValidSebProof({ configKeys: [KEY], request: request(), proof: foreign })).toBe(false);

    const headerForOtherUrl = request({ [SEB_CONFIG_KEY_HEADER]: sebHashFor(PAGE, KEY) });
    expect(hasValidSebProof({ configKeys: [KEY], request: headerForOtherUrl, proof: null })).toBe(false);

    expect(hasValidSebProof({ configKeys: [KEY], request: request(), proof: null })).toBe(false);
    expect(hasValidSebProof({ configKeys: [], request: request(), proof: null })).toBe(false);
  });
});
