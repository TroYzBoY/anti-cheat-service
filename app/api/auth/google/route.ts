import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth";
import { appOrigin, isGoogleConfigured } from "@/lib/env";
import {
  createGoogleAuthRequest,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
} from "@/lib/google";
import { setTemporaryCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Sends the browser to Google's consent screen. */
export function GET(request: NextRequest) {
  const origin = appOrigin(request.url);
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google", origin));
  }

  const { url, state, verifier } = createGoogleAuthRequest(origin);
  const response = NextResponse.redirect(url);
  setTemporaryCookie(response, GOOGLE_STATE_COOKIE, state);
  setTemporaryCookie(response, GOOGLE_VERIFIER_COOKIE, verifier);
  setTemporaryCookie(
    response,
    GOOGLE_NEXT_COOKIE,
    safeNextPath(request.nextUrl.searchParams.get("next")),
  );
  return response;
}
