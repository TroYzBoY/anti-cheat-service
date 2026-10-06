import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let database: { ok: boolean; latencyMs: number };
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    database = { ok: false, latencyMs: Date.now() - startedAt };
  }

  return NextResponse.json(
    {
      status: database.ok ? "ok" : "down",
      service: "fenrir",
      timestamp: new Date().toISOString(),
      checks: { database },
    },
    {
      status: database.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
