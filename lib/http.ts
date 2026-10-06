import { NextResponse } from "next/server";

/**
 * The SDK is served by this app and reports back to it, so signals must be
 * same-origin. Requests without an `Origin` header (curl, server-to-server)
 * pass: they still need a valid token.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

export function jsonError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

export function jsonSuccess(payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...payload }, { status: 200 });
}
