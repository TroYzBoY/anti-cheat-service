import { NextResponse } from "next/server";

import { allowedOrigins } from "@/lib/env";

/**
 * Requests without an `Origin` header (curl, server-to-server) pass: they
 * still need a valid token. Browsers always send one cross-origin.
 */
export function isOriginAllowed(origin: string | null): boolean {
  return origin === null || allowedOrigins.includes(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export function jsonError(
  message: string,
  status: number,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ ok: false, message }, { status, headers });
}

export function jsonSuccess(
  payload: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ ok: true, ...payload }, { status: 200, headers });
}
