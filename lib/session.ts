import "server-only";

import { jwtVerify, SignJWT } from "jose";
import type { NextResponse } from "next/server";

import { env } from "@/lib/env";

/**
 * Signed-in state lives in one HttpOnly cookie holding an HS256 JWT. This
 * module only touches the token (no database), so `proxy.ts` can use it.
 */
export const SESSION_COOKIE = "fenrir.session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const ISSUER = "fenrir";
const AUDIENCE = "fenrir-session";
const secret = new TextEncoder().encode(env.AUTH_SECRET);

export type SessionClaims = { userId: string; role: string };

export async function createSessionToken(user: { id: string; role: string }) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
};

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    maxAge: SESSION_MAX_AGE_SECONDS,
    ...cookieBase,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, ...cookieBase });
}

/** Short-lived cookies for the Google OAuth round trip. */
export function setTemporaryCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set({ name, value, maxAge: 10 * 60, ...cookieBase });
}

export function clearTemporaryCookie(response: NextResponse, name: string) {
  response.cookies.set({ name, value: "", maxAge: 0, ...cookieBase });
}
