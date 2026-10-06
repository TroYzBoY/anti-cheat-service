import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  evaluateEvent,
  getEventLimit,
  outcomeForReason,
  type IntegrityEventType,
  type TerminationReason,
} from "@/lib/policy";
import { prisma } from "@/lib/prisma";

/**
 * Hard cap per exam session so a misbehaving (or malicious) client can't
 * flood the database. A real session produces a few dozen at most.
 */
export const MAX_EVENTS_PER_SESSION = 300;

export type RecordEventInput = {
  userId: string;
  sessionId: string;
  type: IntegrityEventType;
  /** The SDK's own tally for counted types; see `recordIntegrityEvent`. */
  clientCount?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export type RecordEventResult =
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "inactive"; status: string }
  | { kind: "cap-reached" }
  | {
      kind: "recorded";
      count: number;
      limit: number | null;
      terminated: TerminationReason | null;
    };

/**
 * Persist one anti-cheat signal and apply the policy server-side. The exam
 * page only ever *reports*; whether the session ends is decided here.
 */
export async function recordIntegrityEvent(
  input: RecordEventInput,
): Promise<RecordEventResult> {
  const { userId, sessionId, type } = input;

  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    select: { userId: true, status: true },
  });
  if (!session) return { kind: "not-found" };
  if (session.userId !== userId) return { kind: "forbidden" };
  if (session.status !== "ACTIVE") {
    return { kind: "inactive", status: session.status };
  }

  const total = await prisma.examIntegrityEvent.count({ where: { sessionId } });
  if (total >= MAX_EVENTS_PER_SESSION) {
    logEvent("anti_cheat_event_cap_hit", { userId, sessionId, total });
    return { kind: "cap-reached" };
  }

  await prisma.examIntegrityEvent.create({
    data: {
      sessionId,
      userId,
      type,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });

  const serverCount = await prisma.examIntegrityEvent.count({
    where: { sessionId, type },
  });
  // The SDK keeps its own tally so a network gap can't reset the limit.
  // Trusting it is safe: a higher count can only end the caller's own exam.
  const count = Math.max(serverCount, input.clientCount ?? 0);
  const reason = evaluateEvent(type, count);

  if (reason) {
    await terminateSession({ userId, sessionId, reason });
  }

  return {
    kind: "recorded",
    count,
    limit: getEventLimit(type),
    terminated: reason,
  };
}

async function terminateSession({
  userId,
  sessionId,
  reason,
}: {
  userId: string;
  sessionId: string;
  reason: TerminationReason;
}) {
  // Guarded on ACTIVE so concurrent events can't overwrite each other's
  // outcome or clobber a submission that landed first.
  const { count } = await prisma.examSession.updateMany({
    where: { id: sessionId, status: "ACTIVE" },
    data: {
      status: "TERMINATED",
      outcome: outcomeForReason(reason),
      terminationReason: reason,
      scorePercent: 0,
      passed: false,
      submittedAt: new Date(),
    },
  });

  if (count > 0) {
    logEvent("exam_terminated", { userId, sessionId, reason });
  }
}

/** One JSONL line on stdout (Vercel keeps it in the function logs). */
export function logEvent(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level: "info", event, ...fields }));
}
