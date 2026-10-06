/**
 * Exams authored in the admin builder (`/admin`). Shared by the builder UI,
 * the import parser, the server actions and the pages, so it must stay free
 * of `server-only` and DOM imports.
 */
import { z } from "zod";

export const EXAM_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: "Ноорог",
  PUBLISHED: "Нээлттэй",
  CLOSED: "Хаалттай",
};

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 8;
export const MAX_QUESTIONS = 200;

/** Labels shown next to choices: А, Б, В … (Mongolian Cyrillic order). */
export const CHOICE_LABELS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З"] as const;

export function isExamStatus(value: unknown): value is ExamStatus {
  return (
    typeof value === "string" &&
    (EXAM_STATUSES as readonly string[]).includes(value)
  );
}

export type ExamDraftQuestion = {
  prompt: string;
  choices: string[];
  correctIndex: number;
};

export type ExamDraft = {
  title: string;
  description: string;
  durationMinutes: number;
  passPercent: number;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  /** Only Safe Exam Browser with one of `sebConfigKeys` may take the exam. */
  requireSeb: boolean;
  sebConfigKeys: string[];
  questions: ExamDraftQuestion[];
};

/** Splits pasted Config Keys (one per line, or comma-separated). */
export function parseSebConfigKeys(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);
}

export const examDraftQuestionSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, "Асуултын текст хоосон байна.")
      .max(2000, "Асуулт 2000 тэмдэгтээс урт байна."),
    choices: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Хоосон сонголт байна.")
          .max(500, "Сонголт 500 тэмдэгтээс урт байна."),
      )
      .min(MIN_CHOICES, `Дор хаяж ${MIN_CHOICES} сонголт хэрэгтэй.`)
      .max(MAX_CHOICES, `Хамгийн ихдээ ${MAX_CHOICES} сонголт байна.`),
    correctIndex: z.number().int().min(0, "Зөв хариултыг сонгоно уу."),
  })
  .superRefine((question, ctx) => {
    if (question.correctIndex >= question.choices.length) {
      ctx.addIssue({
        code: "custom",
        path: ["correctIndex"],
        message: "Зөв хариултыг сонгоно уу.",
      });
    }
    const normalized = question.choices.map((choice) =>
      choice.trim().toLowerCase(),
    );
    if (new Set(normalized).size !== normalized.length) {
      ctx.addIssue({
        code: "custom",
        path: ["choices"],
        message: "Ижил сонголт давхардсан байна.",
      });
    }
  });

export const examDraftSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Шалгалтын нэрийг оруулна уу.")
    .max(200, "Нэр 200 тэмдэгтээс урт байна."),
  description: z.string().trim().max(5000, "Тайлбар хэт урт байна."),
  durationMinutes: z
    .number()
    .int("Хугацаа бүхэл минут байна.")
    .min(1, "Хугацаа дор хаяж 1 минут.")
    .max(600, "Хугацаа 600 минутаас ихгүй."),
  passPercent: z
    .number()
    .int()
    .min(0, "Тэнцэх хувь 0–100.")
    .max(100, "Тэнцэх хувь 0–100."),
  shuffleQuestions: z.boolean(),
  shuffleChoices: z.boolean(),
  requireSeb: z.boolean(),
  sebConfigKeys: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[0-9a-f]{64}$/, "SEB Config Key нь 64 тэмдэгттэй (0-9, a-f) байна."),
    )
    .max(10, "Хамгийн ихдээ 10 Config Key."),
  questions: z
    .array(examDraftQuestionSchema)
    .max(MAX_QUESTIONS, `Хамгийн ихдээ ${MAX_QUESTIONS} асуулт.`),
}).superRefine((draft, ctx) => {
  if (draft.requireSeb && draft.sebConfigKeys.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["sebConfigKeys"],
      message: "Safe Exam Browser шаардах бол Config Key оруулна уу.",
    });
  }
});

/**
 * First human-readable problem with a draft, or null when it is valid.
 * Issue paths like `questions.2.choices` are turned into "3-р асуулт: …".
 */
export function describeDraftError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Буруу өгөгдөл.";
  const [head, index] = issue.path;
  if (head === "questions" && typeof index === "number") {
    return `${index + 1}-р асуулт: ${issue.message}`;
  }
  return issue.message;
}

export function emptyQuestion(): ExamDraftQuestion {
  return { prompt: "", choices: ["", "", "", ""], correctIndex: -1 };
}

export type AttemptTone = "info" | "good" | "warn" | "bad";

/** One learner's attempt as shown on the exam list and the admin results. */
export function describeAttempt(
  attempt: {
    status: string;
    passed: boolean | null;
    expiresAt: Date;
    outcome: string | null;
  },
  nowMs: number,
): { label: string; tone: AttemptTone; running: boolean } {
  switch (attempt.status) {
    case "ACTIVE":
      return nowMs <= attempt.expiresAt.getTime()
        ? { label: "Явагдаж байна", tone: "info", running: true }
        : { label: "Хугацаа дууссан", tone: "warn", running: false };
    case "SUBMITTED":
      return attempt.passed
        ? { label: "Тэнцсэн", tone: "good", running: false }
        : { label: "Тэнцээгүй", tone: "warn", running: false };
    case "TERMINATED":
      return attempt.outcome === "BANNED"
        ? { label: "Хасагдсан (ban)", tone: "bad", running: false }
        : { label: "Цуцлагдсан", tone: "bad", running: false };
    case "EXPIRED":
      return { label: "Хугацаа дууссан", tone: "warn", running: false };
    default:
      return { label: attempt.status, tone: "info", running: false };
  }
}
