import type { NextRequest } from "next/server";

import { hashPassword } from "@/lib/auth";
import { registerSchema } from "@/lib/auth-schemas";
import { logEvent } from "@/lib/enforcement";
import { Prisma } from "@/lib/generated/prisma/client";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Буруу өгөгдөл.", 400);
  }
  const { fullName, email, password } = parsed.data;

  let user;
  try {
    user = await prisma.user.create({
      data: { fullName, email, passwordHash: await hashPassword(password) },
      select: { id: true, role: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("Энэ имэйлээр бүртгэл үүссэн байна. Нэвтэрнэ үү.", 409);
    }
    throw error;
  }

  logEvent("user_registered", { userId: user.id, method: "password" });
  const response = jsonSuccess({ redirect: "/" });
  setSessionCookie(response, await createSessionToken(user));
  return response;
}
