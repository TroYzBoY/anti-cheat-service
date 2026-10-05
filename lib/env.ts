import "server-only";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Same Postgres database as the main CodeQuest app. */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  /** Shared HS256 secret — must equal ANTI_CHEAT_TOKEN_SECRET in the main app. */
  ANTI_CHEAT_TOKEN_SECRET: z
    .string()
    .min(32, "ANTI_CHEAT_TOKEN_SECRET must be at least 32 characters long."),
  /**
   * Comma-separated browser origins allowed to call the API (the main app's
   * URL, e.g. `https://codequest.vercel.app`). No trailing slash, no paths.
   */
  ALLOWED_ORIGINS: z.string().default(""),
});

const parsedEnv = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  ANTI_CHEAT_TOKEN_SECRET: process.env.ANTI_CHEAT_TOKEN_SECRET,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
});

if (!parsedEnv.success) {
  throw new Error(
    `Invalid server environment configuration: ${parsedEnv.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`,
  );
}

export const env = parsedEnv.data;

export const allowedOrigins: readonly string[] = env.ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
