import type { NextRequest } from "next/server";

import { verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/auth-schemas";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import {
  clearLoginFailures,
  loginLockMinutes,
  recordLoginFailure,
} from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

const WRONG = "Имэйл эсвэл нууц үг буруу байна.";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Буруу өгөгдөл.", 400);
  }
  const { email, password } = parsed.data;

  const lockMinutes = await loginLockMinutes(email);
  if (lockMinutes > 0) {
    return jsonError(
      `Олон удаа буруу оролдсон тул ${lockMinutes} минутын дараа дахин оролдоно уу.`,
      429,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, passwordHash: true, googleSub: true },
  });
  if (!user?.passwordHash) {
    await recordLoginFailure(email);
    return jsonError(
      user?.googleSub ? "Энэ бүртгэл Google-ээр нэвтэрдэг. «Google-ээр нэвтрэх»-ийг ашиглана уу." : WRONG,
      401,
    );
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordLoginFailure(email);
    return jsonError(WRONG, 401);
  }

  await clearLoginFailures(email);
  const response = jsonSuccess({ redirect: "/" });
  setSessionCookie(response, await createSessionToken(user));
  return response;
}
