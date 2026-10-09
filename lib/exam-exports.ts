import "server-only";

import { buildCsv } from "@/lib/csv";
import {
  alignAnswerColumns,
  breakdownQuestions,
  choiceTag,
  countAnswered,
  describeEntry,
  describeUserAgent,
  excerpt,
  finalAnswers,
  formatDateTime,
  formatDuration,
  formatHistory,
  LOG_CATEGORY_LABELS,
  VIOLATION_LABELS,
  type LogEntry,
} from "@/lib/exam-activity";
import { UNANSWERED, type SessionQuestion } from "@/lib/exam-build";
import { describeAttempt } from "@/lib/exam-forms";
import { loadLog } from "@/lib/exam-log";
import { loadExamResults } from "@/lib/exam-results";
import { prisma } from "@/lib/prisma";

/** The kinds of exam-wide CSV the results page offers. */
export const EXAM_EXPORT_KINDS = ["summary", "answers", "log"] as const;
export type ExamExportKind = (typeof EXAM_EXPORT_KINDS)[number];

export function isExamExportKind(value: unknown): value is ExamExportKind {
  return typeof value === "string" && (EXAM_EXPORT_KINDS as readonly string[]).includes(value);
}

/** RFC 5987 `filename*` value: percent-encoded UTF-8, minus characters files can't hold. */
function encodeFileName(name: string): string {
  return encodeURIComponent(name.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim()).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** A CSV download: an ASCII `fileName`, and the readable title for browsers that take it. */
export function csvDownload(csv: string, fileName: string, title?: string) {
  const disposition = title
    ? `attachment; filename="${fileName}"; filename*=UTF-8''${encodeFileName(`${title} - ${fileName}`)}`
    : `attachment; filename="${fileName}"`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}

type AttemptForLog = {
  questions: SessionQuestion[];
  answerKey: number[];
  startedAt: Date;
  fullName: string;
  email: string;
};

const LOG_HEADERS = [
  "Огноо, цаг",
  "Эхэлснээс",
  "Нэр",
  "Имэйл",
  "Ангилал",
  "Үйлдэл",
  "Асуулт №",
  "Асуулт",
  "Өмнөх сонголт",
  "Сонгосон",
  "Зөв эсэх",
  "Дэлгэрэнгүй",
  "IP",
  "Browser / төхөөрөмж",
] as const;

function logRows(entries: LogEntry[], attempts: Map<string, AttemptForLog>) {
  return entries.map((entry) => {
    const attempt = attempts.get(entry.sessionId) ?? null;
    const described = describeEntry(entry, attempt);
    const question =
      entry.questionIndex === null ? undefined : attempt?.questions[entry.questionIndex];
    const isAnswer = entry.source === "activity" && entry.type === "answer";
    return [
      formatDateTime(entry.at),
      attempt ? formatDuration(entry.at.getTime() - attempt.startedAt.getTime()) : "",
      attempt?.fullName ?? "",
      attempt?.email ?? "",
      LOG_CATEGORY_LABELS[described.category],
      described.label,
      entry.questionIndex === null ? "" : entry.questionIndex + 1,
      question ? excerpt(question.prompt, 80) : "",
      isAnswer ? choiceTag(question, entry.previousIndex) : "",
      isAnswer ? choiceTag(question, entry.choiceIndex) : "",
      described.correct === null ? "" : described.correct ? "Зөв" : "Буруу",
      described.detail,
      entry.ip ?? "",
      entry.userAgent ? describeUserAgent(entry.userAgent) : "",
    ];
  });
}

// ── Exam-wide ─────────────────────────────────────────────────────────────

/** One row per learner: status, score, violations, IPs, times. */
export async function examSummaryCsv(examId: string) {
  const { rows } = await loadExamResults(examId, Date.now());
  return buildCsv(
    [
      "Нэр",
      "Имэйл",
      "Төлөв",
      "Оноо (%)",
      "Зөв",
      "Хариулсан",
      "Нийт асуулт",
      "Focus алдсан",
      "Fullscreen-ээс гарсан",
      "Бусад зөрчил",
      "IP хаяг",
      "Эхэлсэн",
      "Дууссан",
      "Зарцуулсан хугацаа",
    ],
    rows.map((row) => [
      row.fullName,
      row.email,
      row.statusLabel,
      row.status === "SUBMITTED" ? row.scorePercent : row.outcome ? 0 : "",
      row.correct ?? "",
      row.answered,
      row.total,
      row.focusLosses,
      row.fullscreenExits,
      Object.entries(row.otherViolations)
        .map(([type, count]) => `${VIOLATION_LABELS[type] ?? type}: ${count}`)
        .join("; "),
      row.ips.join("; "),
      formatDateTime(row.startedAt),
      formatDateTime(row.submittedAt),
      row.durationMs === null ? "" : formatDuration(row.durationMs),
    ]),
  );
}

/**
 * One row per learner, one column per question in the exam's own order
 * (whatever order each learner saw): the picked choice, marked ✓ or ✗.
 * The first row under the header holds the right answers.
 */
export async function examAnswersCsv(examId: string) {
  const [items, sessions] = await Promise.all([
    prisma.examItem.findMany({
      where: { examId },
      orderBy: { position: "asc" },
      select: { id: true, prompt: true, choices: true, correctIndex: true },
    }),
    prisma.examSession.findMany({
      where: { examId },
      orderBy: { startedAt: "asc" },
      select: {
        status: true,
        outcome: true,
        passed: true,
        expiresAt: true,
        scorePercent: true,
        correctCount: true,
        questions: true,
        answerKey: true,
        answers: true,
        draftAnswers: true,
        user: { select: { fullName: true, email: true } },
      },
    }),
  ]);

  const attempts = sessions.map((session) => ({
    ...session,
    questions: session.questions as SessionQuestion[],
  }));
  const { columns, positions } = alignAnswerColumns(items, attempts);
  const now = Date.now();

  const fixed = ["Нэр", "Имэйл", "Төлөв", "Оноо (%)", "Зөв", "Хариулсан"];
  const header = [
    ...fixed,
    ...columns.map((column, index) => `${index + 1}. ${excerpt(column.prompt, 50)}`),
  ];
  const keyRow = [
    "Зөв хариулт",
    ...fixed.slice(1).map(() => ""),
    ...columns.map((column) => column.correctText),
  ];

  const rows = attempts.map((attempt, attemptIndex) => {
    const answers = finalAnswers(attempt);
    const cells: string[] = columns.map(() => "");
    attempt.questions.forEach((question, index) => {
      const choice = answers[index];
      cells[positions[attemptIndex][index]] =
        choice === UNANSWERED
          ? "—"
          : `${choice === attempt.answerKey[index] ? "✓" : "✗"} ${question.choices[choice] ?? ""}`;
    });
    return [
      attempt.user.fullName,
      attempt.user.email,
      describeAttempt(attempt, now).label,
      attempt.status === "SUBMITTED" ? attempt.scorePercent : attempt.outcome ? 0 : "",
      attempt.correctCount ?? "",
      countAnswered(answers),
      ...cells,
    ];
  });

  return buildCsv(header, [keyRow, ...rows]);
}

/** Every line of every learner's log, oldest first. */
export async function examLogCsv(examId: string) {
  const [sessions, { entries }] = await Promise.all([
    prisma.examSession.findMany({
      where: { examId },
      select: {
        id: true,
        questions: true,
        answerKey: true,
        startedAt: true,
        user: { select: { fullName: true, email: true } },
      },
    }),
    loadLog({ sessionWhere: { examId } }),
  ]);
  const attempts = new Map(
    sessions.map((session) => [
      session.id,
      {
        questions: session.questions as SessionQuestion[],
        answerKey: session.answerKey,
        startedAt: session.startedAt,
        fullName: session.user.fullName,
        email: session.user.email,
      },
    ]),
  );
  return buildCsv(LOG_HEADERS, logRows(entries, attempts));
}

// ── One attempt ───────────────────────────────────────────────────────────

type SessionForExport = {
  id: string;
  status: string;
  questions: SessionQuestion[];
  answerKey: number[];
  answers: number[];
  draftAnswers: number[];
  startedAt: Date;
  user: { fullName: string; email: string };
};

/** One row per question: the pick, the right answer, timing and changes. */
export function sessionAnswersCsv(session: SessionForExport, log: LogEntry[]) {
  const answers = finalAnswers(session);
  const breakdown = breakdownQuestions({
    answerKey: session.answerKey,
    finalAnswers: answers,
    startedAt: session.startedAt,
    log,
  });
  const offset = (date: Date | null) =>
    date ? formatDuration(date.getTime() - session.startedAt.getTime()) : "";

  return buildCsv(
    [
      "№",
      "Асуулт",
      "Сонгосон хариулт",
      "Зөв хариулт",
      "Үр дүн",
      "Анх хариулсан",
      "Анх хариулсан (эхэлснээс)",
      "Сүүлд өөрчилсөн",
      "Өөрчилсөн тоо",
      "Зарцуулсан хугацаа (ойролцоо)",
      "Сонголтын түүх",
    ],
    breakdown.map((row) => {
      const question = session.questions[row.index];
      return [
        row.index + 1,
        question?.prompt ?? "",
        choiceTag(question, row.final),
        choiceTag(question, session.answerKey[row.index] ?? null),
        row.final === UNANSWERED ? "Хариулаагүй" : row.correct ? "Зөв" : "Буруу",
        formatDateTime(row.firstAnsweredAt),
        offset(row.firstAnsweredAt),
        formatDateTime(row.lastChangedAt),
        row.changes,
        row.history.length > 0 ? formatDuration(row.timeSpentMs) : "",
        formatHistory(row.history),
      ];
    }),
  );
}

/** The attempt's whole log, oldest first. */
export function sessionLogCsv(session: SessionForExport, log: LogEntry[]) {
  const attempt: AttemptForLog = {
    questions: session.questions,
    answerKey: session.answerKey,
    startedAt: session.startedAt,
    fullName: session.user.fullName,
    email: session.user.email,
  };
  return buildCsv(LOG_HEADERS, logRows(log, new Map([[session.id, attempt]])));
}
