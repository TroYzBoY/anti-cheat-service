import type { NextRequest } from "next/server";

import { resendCodeSchema } from "@/lib/auth-schemas";
import { sendCodeOrError } from "@/lib/email-codes";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * "Send the code again". Only addresses that are waiting for a code get one;
 * the reply is the same either way so it doesn't reveal who has an account.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);

  const parsed = resendCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Буруу хүсэлт.", 400);
  const { email, purpose } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerifiedAt: true },
  });
  const eligible = purpose === "RESET_PASSWORD" ? Boolean(user) : user?.emailVerifiedAt === null;
  if (eligible) {
    const failure = await sendCodeOrError(email, purpose);
    if (failure) return failure;
  }
  return jsonSuccess();
}
