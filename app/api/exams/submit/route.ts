import type { NextRequest } from "next/server";
import { z } from "zod";

import { getUserFromRequest } from "@/lib/auth";
import { logEvent } from "@/lib/enforcement";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { countAnswered } from "@/lib/exam-activity";
import { gradeAnswers, UNANSWERED } from "@/lib/exam-build";
import { recordActivity } from "@/lib/exam-log";
import { appOrigin } from "@/lib/env";
import { MAX_CHOICES } from "@/lib/exam-forms";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasValidSebProof } from "@/lib/seb";
import { examSebConfigKeys } from "@/lib/seb-config";

export const dynamic = "force-dynamic";

/** The runner auto-submits at 0:00; give that request time to arrive. */
const SUBMIT_GRACE_MS = 30_000;

const bodySchema = z.object({
  sessionId: z.string().min(1),
  answers: z.array(z.number().int().min(UNANSWERED).max(MAX_CHOICES - 1)),
  /** The runner's timer sent it at 0:00, not the learner. */
  auto: z.boolean().optional(),
  /** Safe Exam Browser's Config Key hash for the exam page (see lib/seb.ts). */
  seb: z
    .object({ configKeyHash: z.string().max(200), url: z.string().max(2000) })
    .nullish(),
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
        exam: { select: { sebConfigKeys: true } },
      },
    });
    if (!session) return jsonError("Шалгалт олдсонгүй.", 404);
    if (session.userId !== user.id) return jsonError("Энэ шалгалт өөр хүнийх байна.", 403);
    const configKeys = examSebConfigKeys(
      appOrigin(request.url),
      session.examId,
      session.exam.sebConfigKeys,
    );
    if (!hasValidSebProof({ configKeys, request, proof: parsed.data.seb })) {
      await recordActivity({
        sessionId: session.id,
        type: "submit-rejected",
        request,
        metadata: { reason: "seb" },
      });
      return jsonError("Энэ шалгалтыг зөвхөн Safe Exam Browser-оор өгнө.", 403, {
        code: "SEB_REQUIRED",
      });
    }
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
          // Kept so the admin sees what the late submit held.
          draftAnswers: answers,
        },
      });
      await recordActivity({
        sessionId: session.id,
        type: "expired",
        request,
        metadata: { answered: countAnswered(answers), total: answers.length },
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
    await recordActivity({
      sessionId: session.id,
      type: "submitted",
      request,
      metadata: {
        auto: parsed.data.auto === true,
        answered: countAnswered(answers),
        total,
        correct,
        scorePercent,
        passed,
      },
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
