import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth";
import { logEvent } from "@/lib/enforcement";
import { appOrigin, isGoogleConfigured } from "@/lib/env";
import {
  fetchGoogleProfile,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";
import {
  clearTemporaryCookie,
  createSessionToken,
  setSessionCookie,
} from "@/lib/session";

export const dynamic = "force-dynamic";

function finish(response: NextResponse) {
  for (const name of [GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, GOOGLE_NEXT_COOKIE]) {
    clearTemporaryCookie(response, name);
  }
  return response;
}

/**
 * Google redirects back here. Signs the user in, linking or creating the
 * account by Google id first and verified email second.
 */
export async function GET(request: NextRequest) {
  const origin = appOrigin(request.url);
  const failed = () =>
    finish(NextResponse.redirect(new URL("/login?error=google", origin)));
  if (!isGoogleConfigured()) return failed();

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(GOOGLE_VERIFIER_COOKIE)?.value;
  if (!code || !state || !verifier || state !== expectedState) return failed();

  let profile;
  try {
    profile = await fetchGoogleProfile(origin, code, verifier);
  } catch {
    return failed();
  }
  if (!profile.sub || !profile.email || !profile.email_verified) return failed();

  const email = profile.email.trim().toLowerCase();
  const now = new Date();
  let user = await prisma.user.findUnique({ where: { googleSub: profile.sub } });
  if (!user) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Google just proved this email belongs to the person signing in. A
      // password set on an unverified (self-registered) account could have
      // been chosen by someone else who registered the address first, so it
      // is dropped instead of kept as a back door.
      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          googleSub: profile.sub,
          emailVerifiedAt: existing.emailVerifiedAt ?? now,
          ...(existing.emailVerifiedAt ? {} : { passwordHash: null }),
        },
      });
      logEvent("user_google_linked", { userId: user.id });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          fullName: profile.name?.trim() || email,
          googleSub: profile.sub,
          emailVerifiedAt: now,
        },
      });
      logEvent("user_registered", { userId: user.id, method: "google" });
    }
  }

  const next = safeNextPath(request.cookies.get(GOOGLE_NEXT_COOKIE)?.value);
  const response = NextResponse.redirect(new URL(next, origin));
  setSessionCookie(response, await createSessionToken(user));
  return finish(response);
}
