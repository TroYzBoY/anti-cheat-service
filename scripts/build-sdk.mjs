// Bundles sdk/index.ts into public/sdk/v<SDK_VERSION>.js — a single classic
// script the exam page loads cross-origin. Runs before `next dev` / `next build`.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const policySource = readFileSync(new URL("../lib/policy.ts", import.meta.url), "utf8");
const version = policySource.match(/export const SDK_VERSION = (\d+);/)?.[1];
if (!version) {
  throw new Error("Could not read SDK_VERSION from lib/policy.ts");
}

await build({
  entryPoints: ["sdk/index.ts"],
  outfile: `public/sdk/v${version}.js`,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2019"],
  minify: true,
  legalComments: "none",
  banner: { js: `/* CodeQuest anti-cheat SDK v${version} */` },
  logLevel: "info",
});
