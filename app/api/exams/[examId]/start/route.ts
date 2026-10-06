import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { logEvent } from "@/lib/enforcement";
import { isDatabaseUnavailableError } from "@/lib/errors";
import { buildExamSession, type SessionQuestion } from "@/lib/exam-build";
import { Prisma } from "@/lib/generated/prisma/client";
import { isSameOrigin, jsonError, jsonSuccess } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { hasValidSebProof, type SebProof } from "@/lib/seb";
import { createAntiCheatToken } from "@/lib/token";

export const dynamic = "force-dynamic";

/** Matches the submit route's grace window, so a resume near 0:00 still works. */
const RESUME_GRACE_MS = 30_000;

/**
 * Start (or resume) the caller's single attempt at an exam.
 *
 * One attempt per learner per exam is enforced by the
 * `ExamSession(examId, userId)` unique index. Reloading mid-exam resumes the
 * same session with a fresh anti-cheat token; violations keep being counted
 * server-side, so a reload can't reset the focus count.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  if (!isSameOrigin(request)) return jsonError("Origin not allowed.", 403);
  try {
    const user = await getUserFromRequest(request);
    if (!user) return jsonError("Шалгалт өгөхийн тулд нэвтэрнэ үү.", 401);

    const { examId } = await params;
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      omit: { sebConfigFile: true },
      include: { items: { orderBy: { position: "asc" } } },
    });
    // Admins may try out drafts; learners only see published exams.
    if (!exam || (exam.status !== "PUBLISHED" && user.role !== "ADMIN")) {
      return jsonError("Шалгалт олдсонгүй эсвэл хаагдсан байна.", 404);
    }

    const body = (await request.json().catch(() => null)) as { seb?: SebProof } | null;
    if (
      exam.requireSeb &&
      !hasValidSebProof({ configKeys: exam.sebConfigKeys, request, proof: body?.seb })
    ) {
      return jsonError("Энэ шалгалтыг зөвхөн Safe Exam Browser-оор өгнө.", 403, {
        code: "SEB_REQUIRED",
      });
    }

    const existing = await prisma.examSession.findUnique({
      where: { examId_userId: { examId, userId: user.id } },
    });
    if (existing) {
      const running =
        existing.status === "ACTIVE" &&
        Date.now() <= existing.expiresAt.getTime() + RESUME_GRACE_MS;
      if (!running) {
        return jsonError("Та энэ шалгалтыг аль хэдийн өгсөн байна.", 409, {
          code: "EXAM_ALREADY_TAKEN",
          status: existing.status,
        });
      }
      const [token, focusLosses, fullscreenExits] = await Promise.all([
        createAntiCheatToken({
          userId: user.id,
          sessionId: existing.id,
          expiresAt: existing.expiresAt,
        }),
        prisma.examIntegrityEvent.count({
          where: { sessionId: existing.id, type: "focus-loss" },
        }),
        prisma.examIntegrityEvent.count({
          where: { sessionId: existing.id, type: "fullscreen-exit" },
        }),
      ]);
      return jsonSuccess({
        sessionId: existing.id,
        expiresAt: existing.expiresAt.toISOString(),
        questions: existing.questions as SessionQuestion[],
        antiCheat: { token },
        resumed: true,
        // The SDK's own tallies restart at 0 after a reload; the page adds
        // these so the learner sees the real count.
        focusLosses,
        fullscreenExits,
      });
    }

    if (exam.items.length === 0) {
      return jsonError("Энэ шалгалтад асуулт алга байна.", 409);
    }

    const sessionId = randomUUID();
    const built = buildExamSession(exam.items, sessionId, {
      shuffleQuestions: exam.shuffleQuestions,
      shuffleChoices: exam.shuffleChoices,
    });
    const expiresAt = new Date(Date.now() + exam.durationMinutes * 60_000);

    try {
      await prisma.examSession.create({
        data: {
          id: sessionId,
          examId,
          userId: user.id,
          expiresAt,
          passPercent: exam.passPercent,
          questions: built.questions,
          answerKey: built.answerKey,
        },
      });
    } catch (error) {
      // Two tabs pressing Start at once: the unique index lets one through.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return jsonError("Шалгалт аль хэдийн эхэлсэн байна. Хуудсаа шинэчилнэ үү.", 409, {
          code: "EXAM_ALREADY_STARTED",
        });
      }
      throw error;
    }

    logEvent("exam_started", { userId: user.id, examId, sessionId });
    return jsonSuccess({
      sessionId,
      expiresAt: expiresAt.toISOString(),
      questions: built.questions,
      antiCheat: {
        token: await createAntiCheatToken({ userId: user.id, sessionId, expiresAt }),
      },
      resumed: false,
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return jsonError("Өгөгдлийн сан түр ажиллахгүй байна.", 503);
    }
    throw error;
  }
}
