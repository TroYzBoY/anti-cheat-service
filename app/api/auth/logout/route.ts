import type { NextRequest } from "next/server";

import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);
  const response = jsonSuccess({ redirect: "/login" });
  clearSessionCookie(response);
  return response;
}
