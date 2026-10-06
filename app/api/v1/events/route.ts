import type { NextRequest } from "next/server";
import { z } from "zod";

import { recordIntegrityEvent } from "@/lib/enforcement";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
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

/**
 * Receives one anti-cheat signal from the browser SDK.
 *
 * Auth: `Authorization: Bearer <token>` minted by `/api/exams/[examId]/start`
 * for exactly one exam session. The verdict tells the SDK whether the session
 * has ended so the exam page can't keep going after a server-side termination.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return jsonError("Origin not allowed.", 403);
  }

  const token = readBearerToken(request);
  const claims = token ? await verifyAntiCheatToken(token) : null;
  if (!claims) {
    return jsonError("Invalid or expired anti-cheat token.", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Invalid event payload.", 400);
  }

  try {
    const result = await recordIntegrityEvent({
      userId: claims.userId,
      sessionId: claims.sessionId,
      ...parsed.data,
    });

    if (result.kind === "not-found") {
      return jsonError("Exam session not found.", 404);
    }
    if (result.kind === "forbidden") {
      return jsonError("This exam belongs to another account.", 403);
    }
    if (result.kind === "cap-reached") {
      return jsonError("Too many events for this session.", 429);
    }
    if (result.kind === "inactive") {
      return jsonSuccess({ recorded: false, active: false, status: result.status });
    }
    return jsonSuccess({
      recorded: true,
      active: result.terminated === null,
      status: result.terminated === null ? "ACTIVE" : "TERMINATED",
      count: result.count,
      limit: result.limit,
      terminated: result.terminated,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return jsonError("Database unavailable.", 503);
    }
    throw error;
  }
}
