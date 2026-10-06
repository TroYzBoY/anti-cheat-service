import "server-only";

import { jwtVerify, SignJWT } from "jose";

import { env } from "@/lib/env";

export const ANTI_CHEAT_TOKEN_ISSUER = "fenrir";
export const ANTI_CHEAT_TOKEN_AUDIENCE = "fenrir-anti-cheat";

/** Lets a violation raised in the final seconds still be recorded. */
const TOKEN_GRACE_SECONDS = 5 * 60;

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type AntiCheatTokenClaims = {
  userId: string;
  sessionId: string;
};

/**
 * The exam page hands this to the browser SDK, which sends it as
 * `Authorization: Bearer …` with every signal. It is scoped to one user and
 * one exam session, and its audience differs from the session cookie's, so
 * neither token works in place of the other.
 */
export async function createAntiCheatToken({
  userId,
  sessionId,
  expiresAt,
}: AntiCheatTokenClaims & { expiresAt: Date }): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ANTI_CHEAT_TOKEN_ISSUER)
    .setAudience(ANTI_CHEAT_TOKEN_AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000) + TOKEN_GRACE_SECONDS)
    .sign(secret);
}

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
