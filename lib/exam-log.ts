import "server-only";

import { logEvent } from "@/lib/enforcement";
import {
  sortLog,
  type LogCategory,
  type LogEntry,
  type ServerActivityType,
} from "@/lib/exam-activity";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** The caller's IP (Vercel puts the client first in X-Forwarded-For) and browser. */
export function requestClient(request: Request): { ip: string | null; userAgent: string | null } {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || null;
  const userAgent = request.headers.get("user-agent");
  return {
    ip: ip ? ip.slice(0, 64) : null,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
  };
}

/**
 * Adds one server-side line to an attempt's log. Never throws: a lost log
 * line must not fail a start or a submit.
 */
export async function recordActivity(input: {
  sessionId: string;
  type: ServerActivityType;
  request?: Request;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.examActivity.create({
      data: {
        sessionId: input.sessionId,
        type: input.type,
        ...(input.request ? requestClient(input.request) : {}),
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    logEvent("activity_log_failed", {
      sessionId: input.sessionId,
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

type ActivityRow = {
  id: string;
  sessionId: string;
  type: string;
  questionIndex: number | null;
  choiceIndex: number | null;
  previousIndex: number | null;
  ip: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: Date;
};

type IntegrityRow = {
  id: string;
  sessionId: string;
  type: string;
  metadata: unknown;
  createdAt: Date;
};

function activityEntry(row: ActivityRow): LogEntry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    at: row.createdAt,
    source: "activity",
    type: row.type,
    questionIndex: row.questionIndex,
    choiceIndex: row.choiceIndex,
    previousIndex: row.previousIndex,
    ip: row.ip,
    userAgent: row.userAgent,
    metadata: row.metadata,
  };
}

function integrityEntry(row: IntegrityRow): LogEntry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    at: row.createdAt,
    source: "integrity",
    type: row.type,
    questionIndex: null,
    choiceIndex: null,
    previousIndex: null,
    ip: null,
    userAgent: null,
    metadata: row.metadata,
  };
}

/** `ExamActivity.type` values per category; violations live in their own table. */
const ACTIVITY_TYPES_BY_CATEGORY: Record<Exclude<LogCategory, "violation">, string[]> = {
  answer: ["answer"],
  network: ["offline", "online"],
  session: ["started", "resumed", "submitted", "submit-rejected", "expired", "terminated"],
};

/**
 * Activity and anti-cheat rows of the matching attempts, merged oldest first.
 * With `limit`, only the newest `limit` lines are kept.
 */
export async function loadLog(options: {
  sessionWhere: Prisma.ExamSessionWhereInput;
  category?: LogCategory;
  limit?: number;
}): Promise<{ entries: LogEntry[]; truncated: boolean }> {
  const { category, limit } = options;
  const session = options.sessionWhere;
  const take = limit === undefined ? undefined : limit + 1;

  const [activities, events] = await Promise.all([
    category === "violation"
      ? Promise.resolve([])
      : prisma.examActivity.findMany({
          where: {
            session,
            ...(category ? { type: { in: ACTIVITY_TYPES_BY_CATEGORY[category] } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take,
        }),
    category && category !== "violation"
      ? Promise.resolve([])
      : prisma.examIntegrityEvent.findMany({
          where: { session },
          orderBy: { createdAt: "desc" },
          take,
          select: { id: true, sessionId: true, type: true, metadata: true, createdAt: true },
        }),
  ]);

  const entries = sortLog([...activities.map(activityEntry), ...events.map(integrityEntry)]);
  if (limit !== undefined && entries.length > limit) {
    return { entries: entries.slice(entries.length - limit), truncated: true };
  }
  return { entries, truncated: false };
}
