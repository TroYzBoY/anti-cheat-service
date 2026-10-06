import type { NextRequest } from "next/server";
import { z } from "zod";

import { getUserFromRequest } from "@/lib/auth";
import { logEvent } from "@/lib/enforcement";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { gradeAnswers, UNANSWERED } from "@/lib/exam-build";
import { MAX_CHOICES } from "@/lib/exam-forms";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The runner auto-submits at 0:00; give that request time to arrive. */
const SUBMIT_GRACE_MS = 30_000;

const bodySchema = z.object({
  sessionId: z.string().min(1),
  answers: z.array(z.number().int().min(UNANSWERED).max(MAX_CHOICES - 1)),
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);
  try {
    const user = await getUserFromRequest(request);
    if (!user) return jsonError("Нэвтэрнэ үү.", 401);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Буруу хүсэлт.", 400);
    const { sessionId, answers } = parsed.data;

    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        examId: true,
        status: true,
        expiresAt: true,
        passPercent: true,
        answerKey: true,
      },
    });
    if (!session) return jsonError("Шалгалт олдсонгүй.", 404);
    if (session.userId !== user.id) return jsonError("Энэ шалгалт өөр хүнийх байна.", 403);
    if (session.status !== "ACTIVE") return jsonError("Энэ шалгалт дууссан байна.", 409);
    if (answers.length !== session.answerKey.length) {
      return jsonError(`${session.answerKey.length} хариулт хүлээж байсан.`, 400);
    }

    const now = new Date();
    if (now.getTime() > session.expiresAt.getTime() + SUBMIT_GRACE_MS) {
      await prisma.examSession.updateMany({
        where: { id: session.id, status: "ACTIVE" },
        data: {
          status: "EXPIRED",
          outcome: "EXPIRED",
          scorePercent: 0,
          correctCount: 0,
          passed: false,
          submittedAt: now,
        },
      });
      return jsonError("Хугацаа дууссан.", 400, { expired: true });
    }

    const { correct, total, scorePercent } = gradeAnswers(session.answerKey, answers);
    const passed = scorePercent >= session.passPercent;

    // Guarded on ACTIVE so a submit racing an anti-cheat termination can't
    // overwrite the TERMINATED / BANNED verdict.
    const { count } = await prisma.examSession.updateMany({
      where: { id: session.id, status: "ACTIVE" },
      data: {
        status: "SUBMITTED",
        outcome: passed ? "PASS" : "FAIL",
        answers,
        correctCount: correct,
        scorePercent,
        passed,
        submittedAt: now,
      },
    });
    if (count === 0) return jsonError("Энэ шалгалт дууссан байна.", 409);

    logEvent("exam_submitted", {
      userId: user.id,
      examId: session.examId,
      sessionId: session.id,
      correct,
      total,
      scorePercent,
      passed,
    });
    return jsonSuccess({
      correct,
      total,
      scorePercent,
      passPercent: session.passPercent,
      passed,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return jsonError("Өгөгдлийн сан түр ажиллахгүй байна.", 503);
    }
    throw error;
  }
}
