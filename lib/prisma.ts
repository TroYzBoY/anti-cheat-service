import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

// `?schema=fenrir` in DATABASE_URL keeps every table in that Postgres schema,
// the same convention `prisma migrate` follows. Without it: `public`.
const schema = new URL(env.DATABASE_URL).searchParams.get("schema") ?? undefined;

// One client per lambda instance: serverless hosts re-evaluate modules on hot
// reload, so the instance lives on `globalThis` to avoid exhausting the
// database's connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }, { schema }),
  });

globalForPrisma.prisma = prisma;
