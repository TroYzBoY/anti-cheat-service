// Loaded before every Vitest worker. Sets just enough environment for
// `lib/env.ts` to parse — tests must never touch a real database.
const env = process.env as unknown as Record<string, string>;

env.NODE_ENV ??= "test";
env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
env.AUTH_SECRET ??= "test-auth-secret-do-not-use-in-prod-aaaaaaaa";
