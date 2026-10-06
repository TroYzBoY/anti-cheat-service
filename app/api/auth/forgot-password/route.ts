import type { NextRequest } from "next/server";

import { forgotPasswordSchema } from "@/lib/auth-schemas";
import { sendCodeOrError } from "@/lib/email-codes";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Emails a password-reset code. The reply is the same whether or not the
 * address has an account, so this can't be used to find out who is registered.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);

  const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Буруу өгөгдөл.", 400);
  }
  const { email } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const failure = await sendCodeOrError(email, "RESET_PASSWORD");
    if (failure) return failure;
  }
  return jsonSuccess({ email });
}
