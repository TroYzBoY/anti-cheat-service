import "server-only";

import { jwtVerify } from "jose";
import { env } from "@/lib/env";

/** Must match `lib/exam/anti-cheat-token.ts` in the main app. */
export const ANTI_CHEAT_TOKEN_ISSUER = "codequest";
export const ANTI_CHEAT_TOKEN_AUDIENCE = "codequest-anti-cheat";

const secret = new TextEncoder().encode(env.ANTI_CHEAT_TOKEN_SECRET);

export type AntiCheatTokenClaims = {
  userId: string;
  sessionId: string;
};

/**
 * The main app signs one token per exam session at `POST /api/exam/start`
 * (`sub` = user id, `sid` = exam session id, expires shortly after the exam
 * does). Session cookies can't be shared across `*.vercel.app` projects, so
 * this token is the only credential the service accepts.
 */
export async function verifyAntiCheatToken(
  token: string,
): Promise<AntiCheatTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: ANTI_CHEAT_TOKEN_ISSUER,
      audience: ANTI_CHEAT_TOKEN_AUDIENCE,
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      return null;
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
