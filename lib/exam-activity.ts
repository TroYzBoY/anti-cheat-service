/**
 * The detailed log of an attempt: what the exam page reports (answer
 * changes, connection drops), what the server adds (start, resume, submit,
 * end), and the pure helpers that turn it — together with the anti-cheat
 * events — into the admin's timeline, per-question breakdown and CSV rows.
 * The exam page imports the schemas, so this must stay free of `server-only`
 * and DOM imports.
 */
import { z } from "zod";

import { UNANSWERED, type SessionQuestion } from "@/lib/exam-build";
import { CHOICE_LABELS, MAX_CHOICES, MAX_QUESTIONS } from "@/lib/exam-forms";
import { MAX_FOCUS_LOSSES } from "@/lib/policy";

// ── What gets logged ──────────────────────────────────────────────────────

/** Reported by the exam page to `POST /api/exams/activity`. */
export const CLIENT_ACTIVITY_TYPES = ["answer", "offline", "online"] as const;

/** Written by the server itself as the attempt moves along. */
export const SERVER_ACTIVITY_TYPES = [
  "started",
  "resumed",
  "submitted",
  "submit-rejected",
  "expired",
  "terminated",
] as const;

export const ACTIVITY_TYPES = [...CLIENT_ACTIVITY_TYPES, ...SERVER_ACTIVITY_TYPES] as const;

export type ServerActivityType = (typeof SERVER_ACTIVITY_TYPES)[number];

/** Most events one request may carry; the page sends them as they happen. */
export const MAX_ACTIVITY_BATCH = 50;

/** How often the exam page checks in while the learner is just reading. */
export const HEARTBEAT_MS = 60_000;

const choiceIndex = z.number().int().min(UNANSWERED).max(MAX_CHOICES - 1);
/**
 * When it happened (ms), on the server's clock as the page estimates it from
 * the start route's `serverTime`; the server clamps it to the attempt.
 */
const eventTime = z.number().finite().nonnegative();

export const clientActivitySchema = z.union([
  z.object({
    type: z.literal("answer"),
    questionIndex: z.number().int().min(0).max(MAX_QUESTIONS - 1),
    choiceIndex,
    previousIndex: choiceIndex,
    at: eventTime,
  }),
  z.object({
    type: z.enum(["offline", "online"]),
    at: eventTime,
    /** On `online`: how long the connection was down. */
    offlineMs: z.number().int().min(0).max(24 * 60 * 60_000).optional(),
  }),
]);

export type ClientActivity = z.infer<typeof clientActivitySchema>;

export const activityBatchSchema = z.object({
  sessionId: z.string().min(1).max(100),
  /** Every current choice, autosaved as the attempt's draft. */
  answers: z.array(choiceIndex).max(MAX_QUESTIONS).optional(),
  events: z.array(clientActivitySchema).max(MAX_ACTIVITY_BATCH),
});

/**
 * How far the page's clock is from the server's, NTP-style, from one request
 * that reports `serverTime: { receivedAt, sentAt }`. Add it to `Date.now()`.
 */
export function estimateClockOffset(
  requestedAt: number,
  respondedAt: number,
  serverTime: unknown,
): number {
  const server = serverTime as { receivedAt?: unknown; sentAt?: unknown } | null | undefined;
  if (typeof server?.receivedAt !== "number" || typeof server.sentAt !== "number") return 0;
  return Math.round((server.receivedAt - requestedAt + (server.sentAt - respondedAt)) / 2);
}

/** Device details the exam page sends when it starts or resumes. */
export const clientInfoSchema = z.object({
  screen: z.string().max(40).optional(),
  viewport: z.string().max(40).optional(),
  pixelRatio: z.number().finite().min(0).max(20).optional(),
  timeZone: z.string().max(80).optional(),
  language: z.string().max(40).optional(),
  seb: z.boolean().optional(),
});

export type ClientInfo = z.infer<typeof clientInfoSchema>;

// ── Labels ────────────────────────────────────────────────────────────────

export const ACTIVITY_LABELS: Record<string, string> = {
  started: "Шалгалт эхлүүлсэн",
  resumed: "Шалгалтыг дахин нээсэн",
  answer: "Хариулт сонгосон",
  offline: "Интернэт тасарсан",
  online: "Интернэт сэргэсэн",
  submitted: "Шалгалт илгээсэн",
  "submit-rejected": "Илгээх оролдлогыг хүлээж аваагүй",
  expired: "Хугацаа хэтэрсэн",
  terminated: "Шалгалт цуцлагдсан",
};

/** Short names of the anti-cheat signals other than focus and fullscreen. */
export const VIOLATION_LABELS: Record<string, string> = {
  devtools: "DevTools",
  "duplicate-tab": "Давхар tab",
  "fetch-mitm": "Сүлжээ өөрчилсөн",
  "overlay-tampered": "Хуудас өөрчилсөн",
  "multi-monitor": "Олон дэлгэц",
  screenshot: "Print Screen",
};

/** Every anti-cheat signal (`ExamIntegrityEvent.type`). */
export const INTEGRITY_LABELS: Record<string, string> = {
  ...VIOLATION_LABELS,
  "focus-loss": "Цонхноос гарсан (focus)",
  "fullscreen-exit": "Fullscreen-ээс гарсан",
};

export const TERMINATION_REASON_LABELS: Record<string, string> = {
  "focus-loss-limit": `Цонхноос ${MAX_FOCUS_LOSSES} удаа гарсан`,
  "fullscreen-exit-limit": "Fullscreen-ээс хэт олон удаа гарсан",
  devtools: "Developer tools нээсэн",
  "duplicate-tab": "Давхар tab нээсэн",
  "fetch-mitm": "Сүлжээний API өөрчилсөн",
  "overlay-tampered": "Хуудсанд overlay/өөрчлөлт илэрсэн",
  screenshot: "Print Screen дарсан (дэлгэцийн зураг)",
};

export const LOG_CATEGORIES = ["answer", "violation", "session", "network"] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  answer: "Хариулт",
  violation: "Зөрчил",
  session: "Шалгалт",
  network: "Сүлжээ",
};

export function isLogCategory(value: unknown): value is LogCategory {
  return typeof value === "string" && (LOG_CATEGORIES as readonly string[]).includes(value);
}

// ── Formatting ────────────────────────────────────────────────────────────

const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ulaanbaatar",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "2026-10-09 14:03:27", Ulaanbaatar time. */
export function formatDateTime(date: Date | null | undefined): string {
  return date ? dateTimeFormat.format(date) : "";
}

/** 75_000 → "1:15", 3_725_000 → "1:02:05". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * `text` on one line, cut to `max` characters. Keeps the code after a stem
 * like "Дараах код юу хэвлэх вэ?", which many questions share.
 */
export function excerpt(text: string, max = 60): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Checked in order: Edge and Chrome both say "Chrome", Chrome also says "Safari". */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg\/(\d+)/, "Edge"],
  [/\bFirefox\/(\d+)/, "Firefox"],
  [/\bChrome\/(\d+)/, "Chrome"],
  [/\bVersion\/(\d+)[\d.]*.*\bSafari\//, "Safari"],
];

const OPERATING_SYSTEMS: [RegExp, string][] = [
  [/Windows NT 10\.0/, "Windows 10/11"],
  [/Windows NT/, "Windows"],
  [/iPad|iPhone/, "iOS/iPadOS"],
  [/Mac OS X/, "macOS"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/** "SEB 3.7.1 · Chrome 126 · Windows 10/11" from a User-Agent header. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "—";
  const parts: string[] = [];
  const seb = /\bSEB\/([\d.]+)/.exec(userAgent);
  if (seb) parts.push(`SEB ${seb[1]}`);
  else if (/\bSEB\b/.test(userAgent)) parts.push("SEB");

  for (const [pattern, name] of BROWSERS) {
    const match = pattern.exec(userAgent);
    if (match) {
      parts.push(`${name} ${match[1]}`);
      break;
    }
  }
  const os = OPERATING_SYSTEMS.find(([pattern]) => pattern.test(userAgent));
  if (os) parts.push(os[1]);

  return parts.length > 0 ? parts.join(" · ") : excerpt(userAgent, 80);
}

/** "Дэлгэц 1920×1080 · цонх 1920×1040 · 1.25x · Asia/Ulaanbaatar · mn-MN". */
export function describeClientInfo(info: unknown): string {
  const parsed = clientInfoSchema.safeParse(info);
  if (!parsed.success) return "";
  const { screen, viewport, pixelRatio, timeZone, language } = parsed.data;
  return [
    screen ? `Дэлгэц ${screen}` : null,
    viewport ? `цонх ${viewport}` : null,
    pixelRatio && pixelRatio !== 1 ? `${pixelRatio}x` : null,
    timeZone ?? null,
    language ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ── The merged log ────────────────────────────────────────────────────────

/** One `ExamActivity` or `ExamIntegrityEvent` row, in a common shape. */
export type LogEntry = {
  id: string;
  sessionId: string;
  at: Date;
  source: "activity" | "integrity";
  type: string;
  questionIndex: number | null;
  choiceIndex: number | null;
  previousIndex: number | null;
  ip: string | null;
  userAgent: string | null;
  metadata: unknown;
};

/** Oldest first; ties keep a stable order. */
export function sortLog(entries: LogEntry[]): LogEntry[] {
  return [...entries].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id),
  );
}

export function logCategory(entry: Pick<LogEntry, "source" | "type">): LogCategory {
  if (entry.source === "integrity") return "violation";
  if (entry.type === "answer") return "answer";
  if (entry.type === "offline" || entry.type === "online") return "network";
  return "session";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** "Б. <class 'float'>", or "—" for no choice. */
export function choiceTag(question: SessionQuestion | undefined, index: number | null): string {
  if (index === null || index === UNANSWERED) return "—";
  const label = CHOICE_LABELS[index] ?? String(index + 1);
  const text = question?.choices[index];
  return text === undefined ? label : `${label}. ${excerpt(text, 40)}`;
}

export type DescribedEntry = {
  label: string;
  detail: string;
  category: LogCategory;
  /** For an answer: whether the newly picked choice is the right one. */
  correct: boolean | null;
};

const SUBMIT_REJECTED_REASONS: Record<string, string> = {
  seb: "Safe Exam Browser-ийн баталгаагүй хүсэлт",
};

const FOCUS_VIA_LABELS: Record<string, string> = {
  "window-blur": "цонхны focus алдсан",
  "tab-hidden": "tab нуугдсан",
};

/** What the admin reads for one log line. */
export function describeEntry(
  entry: LogEntry,
  attempt: { questions: SessionQuestion[]; answerKey: number[] } | null,
): DescribedEntry {
  const category = logCategory(entry);
  const meta = record(entry.metadata);

  if (entry.source === "integrity") {
    let detail: string;
    if (entry.type === "focus-loss" && typeof meta.via === "string") {
      detail = FOCUS_VIA_LABELS[meta.via] ?? meta.via;
    } else if (entry.type === "multi-monitor") {
      detail = [
        meta.extended === true ? "Өргөтгөсөн дэлгэц илэрсэн" : null,
        typeof meta.availWidthRatio === "number"
          ? `өргөний харьцаа ${meta.availWidthRatio}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
    } else {
      detail = Object.entries(meta)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(" · ");
    }
    return {
      label: INTEGRITY_LABELS[entry.type] ?? entry.type,
      detail,
      category,
      correct: null,
    };
  }

  switch (entry.type) {
    case "answer": {
      const index = entry.questionIndex ?? -1;
      const question = attempt?.questions[index];
      const cleared = entry.choiceIndex === UNANSWERED;
      const key = attempt?.answerKey[index];
      return {
        label: cleared ? "Хариултаа арилгасан" : ACTIVITY_LABELS.answer,
        detail: `${index + 1}-р асуулт: ${choiceTag(question, entry.previousIndex)} → ${choiceTag(question, entry.choiceIndex)}`,
        category,
        correct: cleared || key === undefined ? null : entry.choiceIndex === key,
      };
    }
    case "started":
    case "resumed":
      return {
        label: ACTIVITY_LABELS[entry.type],
        detail: [describeUserAgent(entry.userAgent), describeClientInfo(meta)]
          .filter((part) => part && part !== "—")
          .join(" · "),
        category,
        correct: null,
      };
    case "submitted": {
      const total = Number(meta.total ?? 0);
      return {
        label: ACTIVITY_LABELS.submitted,
        detail: [
          meta.auto === true ? "Хугацаа дуусахад автоматаар" : "Гараар илгээсэн",
          `${Number(meta.answered ?? 0)}/${total} хариулсан`,
          `${Number(meta.correct ?? 0)}/${total} зөв (${Number(meta.scorePercent ?? 0)}%)`,
        ].join(" · "),
        category,
        correct: null,
      };
    }
    case "expired":
      return {
        label: ACTIVITY_LABELS.expired,
        detail: `Хугацаа дууссаны дараа илгээсэн · ${Number(meta.answered ?? 0)}/${Number(meta.total ?? 0)} хариулсан`,
        category,
        correct: null,
      };
    case "submit-rejected":
      return {
        label: ACTIVITY_LABELS["submit-rejected"],
        detail:
          typeof meta.reason === "string"
            ? (SUBMIT_REJECTED_REASONS[meta.reason] ?? meta.reason)
            : "",
        category,
        correct: null,
      };
    case "terminated":
      return {
        label: ACTIVITY_LABELS.terminated,
        detail:
          typeof meta.reason === "string"
            ? (TERMINATION_REASON_LABELS[meta.reason] ?? meta.reason)
            : "",
        category,
        correct: null,
      };
    case "online":
      return {
        label: ACTIVITY_LABELS.online,
        detail:
          typeof meta.offlineMs === "number"
            ? `${formatDuration(meta.offlineMs)} тасарсан`
            : "",
        category,
        correct: null,
      };
    default:
      return {
        label: ACTIVITY_LABELS[entry.type] ?? entry.type,
        detail: "",
        category,
        correct: null,
      };
  }
}

// ── Answers ───────────────────────────────────────────────────────────────

/**
 * The choices to show for an attempt: what was submitted, or else the last
 * autosaved draft (a banned, expired or running attempt).
 */
export function finalAnswers(attempt: {
  status: string;
  answers: number[];
  draftAnswers: number[];
  answerKey: number[];
}): number[] {
  const count = attempt.answerKey.length;
  const source =
    attempt.status === "SUBMITTED" && attempt.answers.length === count
      ? attempt.answers
      : attempt.draftAnswers.length === count
        ? attempt.draftAnswers
        : [];
  return Array.from({ length: count }, (_, index) => source[index] ?? UNANSWERED);
}

export function countAnswered(answers: number[]): number {
  return answers.filter((answer) => answer !== UNANSWERED).length;
}

export type QuestionBreakdown = {
  index: number;
  final: number;
  correct: boolean;
  firstAnsweredAt: Date | null;
  lastChangedAt: Date | null;
  /** Answer changes after the first pick (clearing counts). */
  changes: number;
  /**
   * Roughly how long the learner spent on it: for each answer to this
   * question, the time since the previous answer to any question (or the start).
   */
  timeSpentMs: number;
  /** The choice after each answer event, oldest first. */
  history: number[];
};

export function breakdownQuestions(input: {
  answerKey: number[];
  finalAnswers: number[];
  startedAt: Date;
  log: LogEntry[];
}): QuestionBreakdown[] {
  const rows = input.answerKey.map(
    (key, index): QuestionBreakdown => ({
      index,
      final: input.finalAnswers[index] ?? UNANSWERED,
      correct: input.finalAnswers[index] === key,
      firstAnsweredAt: null,
      lastChangedAt: null,
      changes: 0,
      timeSpentMs: 0,
      history: [],
    }),
  );

  let previousAt = input.startedAt.getTime();
  for (const entry of sortLog(input.log)) {
    if (entry.source !== "activity" || entry.type !== "answer") continue;
    const row = entry.questionIndex === null ? undefined : rows[entry.questionIndex];
    if (!row || entry.choiceIndex === null) continue;
    const at = entry.at.getTime();
    row.timeSpentMs += Math.max(0, at - previousAt);
    previousAt = Math.max(previousAt, at);
    row.firstAnsweredAt ??= entry.at;
    row.lastChangedAt = entry.at;
    row.history.push(entry.choiceIndex);
  }
  for (const row of rows) row.changes = Math.max(0, row.history.length - 1);
  return rows;
}

/** "Б → Г → —" from a breakdown's history. */
export function formatHistory(history: number[]): string {
  return history
    .map((choice) => (choice === UNANSWERED ? "—" : (CHOICE_LABELS[choice] ?? String(choice + 1))))
    .join(" → ");
}

// ── One column per question across attempts (CSV export) ──────────────────

export type AnswerColumn = { prompt: string; correctText: string };

type ColumnSource = { id: string; prompt: string; choices: string[] };

/** Same question even after the exam was re-saved (new ids) or choices shuffled. */
function signature(question: { prompt: string; choices: string[] }): string {
  const choices = question.choices.map((choice) => choice.trim()).sort();
  return `${question.prompt.trim()}\u0000${choices.join("\u0001")}`;
}

/**
 * Lines up every attempt's questions with the exam's current questions, so
 * an export has one column per question however the attempts were shuffled.
 * Questions that were since removed from the exam get columns at the end.
 */
export function alignAnswerColumns(
  items: (ColumnSource & { correctIndex: number })[],
  attempts: { questions: SessionQuestion[]; answerKey: number[] }[],
): { columns: AnswerColumn[]; positions: number[][] } {
  const columns: AnswerColumn[] = [];
  const byId = new Map<string, number>();
  const bySignature = new Map<string, number>();
  const add = (question: ColumnSource, correctText: string) => {
    const column = columns.push({ prompt: question.prompt, correctText }) - 1;
    byId.set(question.id, column);
    if (!bySignature.has(signature(question))) bySignature.set(signature(question), column);
    return column;
  };

  for (const item of items) add(item, item.choices[item.correctIndex] ?? "");

  const positions = attempts.map((attempt) =>
    attempt.questions.map((question, index) => {
      const known = byId.get(question.id) ?? bySignature.get(signature(question));
      if (known !== undefined) {
        byId.set(question.id, known);
        return known;
      }
      return add(question, question.choices[attempt.answerKey[index]] ?? "");
    }),
  );
  return { columns, positions };
}
