// Loaded before every Vitest worker. Sets just enough environment for
// `lib/env.ts` to parse — tests must never touch the real shared database.
const env = process.env as unknown as Record<string, string>;

env.NODE_ENV ??= "test";
env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
env.ANTI_CHEAT_TOKEN_SECRET ??= "test-anti-cheat-secret-do-not-use-in-prod-aaaa";
env.ALLOWED_ORIGINS ??= "http://localhost:3000";
