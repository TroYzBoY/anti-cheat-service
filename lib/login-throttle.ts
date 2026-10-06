import "server-only";

import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60 * 1000;

/** Minutes until `email` may try again, or 0 when it isn't locked. */
export async function loginLockMinutes(email: string): Promise<number> {
  const row = await prisma.loginThrottle.findUnique({ where: { email } });
  const remaining = row?.lockedUntil ? row.lockedUntil.getTime() - Date.now() : 0;
  return remaining > 0 ? Math.ceil(remaining / 60_000) : 0;
}

/** Counts a wrong password; the 10th within 15 minutes locks the email. */
export async function recordLoginFailure(email: string): Promise<void> {
  const now = new Date();
  const row = await prisma.loginThrottle.findUnique({ where: { email } });
  const fresh = !row || now.getTime() - row.windowStart.getTime() > WINDOW_MS;
  const failures = fresh ? 1 : row.failures + 1;
  const data = {
    failures,
    windowStart: fresh ? now : row.windowStart,
    lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null,
  };
  await prisma.loginThrottle.upsert({
    where: { email },
    create: { email, ...data },
    update: data,
  });
}

export async function clearLoginFailures(email: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { email } });
}
