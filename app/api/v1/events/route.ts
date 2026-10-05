import type { NextRequest } from "next/server";
import { z } from "zod";

import { recordIntegrityEvent } from "@/lib/enforcement";
import { isDatabaseUnavailableError } from "@/lib/errors";
import {
  corsHeaders,
  isOriginAllowed,
  jsonError,
  jsonSuccess,
} from "@/lib/http";
import { INTEGRITY_EVENT_TYPES } from "@/lib/policy";
import { readBearerToken, verifyAntiCheatToken } from "@/lib/token";

export const dynamic = "force-dynamic";

const metadataValue = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const bodySchema = z.object({
  type: z.enum(INTEGRITY_EVENT_TYPES),
  clientCount: z.number().int().min(0).max(1000).optional(),
  metadata: z
    .record(z.string().max(40), metadataValue)
    .refine((value) => Object.keys(value).length <= 16, "Too many metadata keys.")
    .optional(),
});

export function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/**
 * Receives one anti-cheat signal from the browser SDK.
 *
 * Auth: `Authorization: Bearer <token>` minted by the main app for exactly
 * one exam session. The verdict tells the SDK whether the session has ended
 * so the exam page can't keep going after a server-side termination.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (!isOriginAllowed(origin)) {
    return jsonError("Origin not allowed.", 403, headers);
  }

  const token = readBearerToken(request);
  const claims = token ? await verifyAntiCheatToken(token) : null;
  if (!claims) {
    return jsonError("Invalid or expired anti-cheat token.", 401, headers);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid event payload.", 400, headers);
  }

  try {
    const result = await recordIntegrityEvent({
      userId: claims.userId,
      sessionId: claims.sessionId,
      ...parsed.data,
    });

    if (result.kind === "not-found") {
      return jsonError("Exam session not found.", 404, headers);
    }
    if (result.kind === "forbidden") {
      return jsonError("This exam belongs to another account.", 403, headers);
    }
    if (result.kind === "cap-reached") {
      return jsonError("Too many events for this session.", 429, headers);
    }
    if (result.kind === "inactive") {
      return jsonSuccess(
        { recorded: false, active: false, status: result.status },
        headers,
      );
    }
    return jsonSuccess(
      {
        recorded: true,
        active: result.terminated === null,
        status: result.terminated === null ? "ACTIVE" : "TERMINATED",
        count: result.count,
        limit: result.limit,
        terminated: result.terminated,
      },
      headers,
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return jsonError("Database unavailable.", 503, headers);
    }
    throw error;
  }
}
