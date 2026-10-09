import type { NextRequest } from "next/server";

import { getUserFromRequest } from "@/lib/auth";
import { isDatabaseUnavailableError } from "@/lib/errors";
import type { SessionQuestion } from "@/lib/exam-build";
import { csvDownload, sessionAnswersCsv, sessionLogCsv } from "@/lib/exam-exports";
import { loadLog } from "@/lib/exam-log";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * One learner's attempt as a CSV: `?kind=answers` (default, one row per
 * question with timing and changes) or `log` (every logged action).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return jsonError("Нэвтэрнэ үү.", 401);
    if (user.role !== "ADMIN") return jsonError("Зөвхөн админ.", 403);

    const kind = request.nextUrl.searchParams.get("kind") ?? "answers";
    if (kind !== "answers" && kind !== "log") return jsonError("Буруу төрөл.", 400);

    const { sessionId } = await params;
    const session = await prisma.examSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        questions: true,
        answerKey: true,
        answers: true,
        draftAnswers: true,
        startedAt: true,
        user: { select: { fullName: true, email: true } },
        exam: { select: { title: true } },
      },
    });
    if (!session) return jsonError("Оролдлого олдсонгүй.", 404);

    const { entries } = await loadLog({ sessionWhere: { id: session.id } });
    const attempt = { ...session, questions: session.questions as SessionQuestion[] };
    const csv =
      kind === "answers" ? sessionAnswersCsv(attempt, entries) : sessionLogCsv(attempt, entries);

    const today = new Date().toISOString().slice(0, 10);
    return csvDownload(
      csv,
      `attempt-${kind}-${session.id}-${today}.csv`,
      `${session.exam.title} - ${session.user.fullName}`,
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) return jsonError("Database unavailable.", 503);
    throw error;
  }
}
