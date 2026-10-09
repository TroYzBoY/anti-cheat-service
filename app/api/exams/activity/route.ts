import type { NextRequest } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { logEvent } from "@/lib/enforcement";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { activityBatchSchema } from "@/lib/exam-activity";
import { requestClient } from "@/lib/exam-log";
import type { Prisma } from "@/lib/generated/prisma/client";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** A real attempt logs a few hundred lines; this stops a flood. */
const MAX_ACTIVITIES_PER_SESSION = 3000;

/** Events still in flight when the attempt ended are kept for this long. */
const LATE_EVENT_GRACE_MS = 60_000;

/** Clock slack for events that happened just before the attempt ended. */
const END_TOLERANCE_MS = 2_000;

/**
 * The exam page's log feed and autosave: answer changes and connection drops
 * as they happen, the current choices, and a heartbeat (no events) while the
 * learner reads. Nothing here is graded — `/api/exams/submit` still decides
 * the score.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);
  try {
    const user = await getUserFromRequest(request);
    if (!user) return jsonError("Нэвтэрнэ үү.", 401);

    const parsed = activityBatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Буруу хүсэлт.", 400);
    const { sessionId, answers, events } = parsed.data;

    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        answerKey: true,
      },
    });
    if (!session) return jsonError("Шалгалт олдсонгүй.", 404);
    if (session.userId !== user.id) return jsonError("Энэ шалгалт өөр хүнийх байна.", 403);

    const now = Date.now();
    const active = session.status === "ACTIVE";
    const endedAt = active ? now : (session.submittedAt?.getTime() ?? now);
    const questionCount = session.answerKey.length;
    const { ip } = requestClient(request);

    const rows: Prisma.ExamActivityCreateManyInput[] = [];
    if (active || now - endedAt <= LATE_EVENT_GRACE_MS) {
      for (const event of events) {
        // The page already set its clock by ours; this only keeps it inside the attempt.
        const at = Math.min(Math.max(event.at, session.startedAt.getTime()), now);
        if (!active && at > endedAt + END_TOLERANCE_MS) continue;
        if (event.type === "answer") {
          if (event.questionIndex >= questionCount) continue;
          rows.push({
            sessionId,
            type: event.type,
            questionIndex: event.questionIndex,
            choiceIndex: event.choiceIndex,
            previousIndex: event.previousIndex,
            ip,
            createdAt: new Date(at),
          });
        } else {
          rows.push({
            sessionId,
            type: event.type,
            ip,
            metadata: event.offlineMs === undefined ? undefined : { offlineMs: event.offlineMs },
            createdAt: new Date(at),
          });
        }
      }
    }

    let recorded = 0;
    if (rows.length > 0) {
      const existing = await prisma.examActivity.count({ where: { sessionId } });
      const room = Math.max(0, MAX_ACTIVITIES_PER_SESSION - existing);
      if (room < rows.length) {
        logEvent("activity_cap_hit", { userId: user.id, sessionId, existing });
      }
      if (room > 0) {
        ({ count: recorded } = await prisma.examActivity.createMany({
          data: rows.slice(0, room),
        }));
      }
    }

    if (active) {
      // Guarded on ACTIVE so a late autosave can't touch a finished attempt.
      await prisma.examSession.updateMany({
        where: { id: sessionId, status: "ACTIVE" },
        data: {
          lastSeenAt: new Date(now),
          ...(answers?.length === questionCount ? { draftAnswers: answers } : {}),
        },
      });
    }

    return jsonSuccess({ active, recorded });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) return jsonError("Database unavailable.", 503);
    throw error;
  }
}
