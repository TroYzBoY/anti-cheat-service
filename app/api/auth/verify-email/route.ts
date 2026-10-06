import type { NextRequest } from "next/server";

import { verifyEmailSchema } from "@/lib/auth-schemas";
import { CODE_MESSAGES, consumeCode } from "@/lib/email-codes";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Confirms the sign-up code, marks the email verified and signs the user in. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);

  const parsed = verifyEmailSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Буруу өгөгдөл.", 400);
  }
  const { email, code } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const result = user ? await consumeCode(email, "VERIFY_EMAIL", code) : "expired";
  if (!user || result !== "ok") {
    return jsonError(CODE_MESSAGES[result === "ok" ? "expired" : result], 400);
  }

  const verified = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
    select: { id: true, role: true },
  });
  const response = jsonSuccess({ redirect: "/" });
  setSessionCookie(response, await createSessionToken(verified));
  return response;
}
