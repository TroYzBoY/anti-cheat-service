import "server-only";

import { describeAttempt, type AttemptTone } from "@/lib/exam-forms";
import { prisma } from "@/lib/prisma";

export type ExamResultRow = {
  sessionId: string;
  userId: string;
  fullName: string;
  email: string;
  status: string;
  outcome: string | null;
  statusLabel: string;
  statusTone: AttemptTone;
  running: boolean;
  scorePercent: number | null;
  correct: number | null;
  total: number;
  focusLosses: number;
  fullscreenExits: number;
  /** DevTools, duplicate tab, tampering, multi-monitor… by type. */
  otherViolations: Record<string, number>;
  startedAt: Date;
  submittedAt: Date | null;
};

export type ExamResultStats = {
  participants: number;
  running: number;
  submitted: number;
  passed: number;
  banned: number;
  averageScore: number | null;
};

export const VIOLATION_LABELS: Record<string, string> = {
  devtools: "DevTools",
  "duplicate-tab": "Давхар tab",
  "fetch-mitm": "Сүлжээ өөрчилсөн",
  "overlay-tampered": "Хуудас өөрчилсөн",
  "multi-monitor": "Олон дэлгэц",
};

/** Violation counts per session, keyed by event type. */
export async function countViolations(sessionIds: string[]) {
  const counts =
    sessionIds.length === 0
      ? []
      : await prisma.examIntegrityEvent.groupBy({
          by: ["sessionId", "type"],
          where: { sessionId: { in: sessionIds } },
          _count: { _all: true },
        });
  const bySession = new Map<string, Record<string, number>>();
  for (const row of counts) {
    const bucket = bySession.get(row.sessionId) ?? {};
    bucket[row.type] = row._count._all;
    bySession.set(row.sessionId, bucket);
  }
  return bySession;
}

/** Every attempt at one exam, newest first, with violation counts. */
export async function loadExamResults(
  examId: string,
  nowMs: number,
): Promise<{ rows: ExamResultRow[]; stats: ExamResultStats }> {
  const sessions = await prisma.examSession.findMany({
    where: { examId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      userId: true,
      status: true,
      outcome: true,
      passed: true,
      scorePercent: true,
      correctCount: true,
      answerKey: true,
      startedAt: true,
      submittedAt: true,
      expiresAt: true,
      user: { select: { fullName: true, email: true } },
    },
  });
  const violations = await countViolations(sessions.map((session) => session.id));

  const rows = sessions.map((session): ExamResultRow => {
    const view = describeAttempt(session, nowMs);
    const {
      "focus-loss": focusLosses = 0,
      "fullscreen-exit": fullscreenExits = 0,
      ...other
    } = violations.get(session.id) ?? {};
    return {
      sessionId: session.id,
      userId: session.userId,
      fullName: session.user.fullName,
      email: session.user.email,
      status: session.status,
      outcome: session.outcome,
      statusLabel: view.label,
      statusTone: view.tone,
      running: view.running,
      scorePercent: session.scorePercent,
      correct: session.correctCount,
      total: session.answerKey.length,
      focusLosses,
      fullscreenExits,
      otherViolations: other,
      startedAt: session.startedAt,
      submittedAt: session.submittedAt,
    };
  });

  const submitted = rows.filter((row) => row.status === "SUBMITTED");
  return {
    rows,
    stats: {
      participants: rows.length,
      running: rows.filter((row) => row.running).length,
      submitted: submitted.length,
      passed: submitted.filter((row) => row.outcome === "PASS").length,
      banned: rows.filter((row) => row.outcome === "BANNED").length,
      averageScore:
        submitted.length === 0
          ? null
          : Math.round(
              submitted.reduce((sum, row) => sum + (row.scorePercent ?? 0), 0) /
                submitted.length,
            ),
    },
  };
}
