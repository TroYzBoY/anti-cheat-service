import "server-only";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * This app's own Postgres (pooled connection string on Vercel). Add
   * `?schema=<name>` to keep the tables in their own Postgres schema.
   */
  DATABASE_URL: z.string().url("DATABASE_URL must be a postgres:// URL."),
  /** Signs session cookies and the per-exam anti-cheat tokens. */
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters long."),
  /**
   * Public origin, e.g. `https://fenrir-anticheat.vercel.app`. Optional: the
   * request's own origin is used when unset. Fixes the Google redirect URI.
   */
  APP_URL: z.string().url().optional().or(z.literal("")),
  /** "Sign in with Google" appears only when both are set. */
  GOOGLE_CLIENT_ID: z.string().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal("")),
});

const parsedEnv = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  APP_URL: process.env.APP_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
});

if (!parsedEnv.success) {
  throw new Error(
    `Invalid server environment configuration: ${parsedEnv.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`,
  );
}

export const env = parsedEnv.data;

export function isGoogleConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** The app's public origin: `APP_URL` when set, else the request's origin. */
export function appOrigin(requestUrl: string) {
  return env.APP_URL ? new URL(env.APP_URL).origin : new URL(requestUrl).origin;
}
