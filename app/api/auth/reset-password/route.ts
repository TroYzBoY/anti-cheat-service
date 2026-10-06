import type { NextRequest } from "next/server";

import { hashPassword } from "@/lib/auth";
import { resetPasswordSchema } from "@/lib/auth-schemas";
import { CODE_MESSAGES, consumeCode } from "@/lib/email-codes";
import { logEvent } from "@/lib/enforcement";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { clearLoginFailures } from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Sets a new password with the emailed code and signs the user in. The code
 * proves the address, so it also counts as email verification.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);

  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Буруу өгөгдөл.", 400);
  }
  const { email, code, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });
  const result = user ? await consumeCode(email, "RESET_PASSWORD", code) : "expired";
  if (!user || result !== "ok") {
    return jsonError(CODE_MESSAGES[result === "ok" ? "expired" : result], 400);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
    select: { id: true, role: true },
  });
  await clearLoginFailures(email);
  logEvent("password_reset", { userId: updated.id });

  const response = jsonSuccess({ redirect: "/" });
  setSessionCookie(response, await createSessionToken(updated));
  return response;
}
