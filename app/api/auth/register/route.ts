import type { NextRequest } from "next/server";

import { hashPassword } from "@/lib/auth";
import { registerSchema } from "@/lib/auth-schemas";
import { sendCodeOrError } from "@/lib/email-codes";
import { logEvent } from "@/lib/enforcement";
import { Prisma } from "@/lib/generated/prisma/client";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Creates the account unverified and emails a 6-digit code; the learner is
 * signed in only after `/api/auth/verify-email` accepts it. Registering again
 * with an address that was never verified simply replaces the details.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Буруу өгөгдөл.", 400);
  }
  const { fullName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });
  if (existing?.emailVerifiedAt) {
    return jsonError(
      "Энэ имэйлээр бүртгэл үүссэн байна. Нэвтрэх эсвэл «Нууц үгээ мартсан»-ыг ашиглана уу.",
      409,
    );
  }

  const passwordHash = await hashPassword(password);
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { fullName, passwordHash } });
  } else {
    try {
      const created = await prisma.user.create({
        data: { fullName, email, passwordHash },
        select: { id: true },
      });
      logEvent("user_registered", { userId: created.id, method: "password" });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return jsonError("Энэ имэйлээр бүртгэл үүссэн байна. Нэвтэрнэ үү.", 409);
      }
      throw error;
    }
  }

  // A code sent under a minute ago is still good: go straight to entering it.
  const failure = await sendCodeOrError(email, "VERIFY_EMAIL", { cooldownIsSent: true });
  if (failure) return failure;
  return jsonSuccess({ verify: true, email });
}
