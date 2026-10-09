import { MAX_ACTIVITY_BATCH, type ClientActivity } from "@/lib/exam-activity";

/** `Omit` per union member, so each event type keeps its own fields. */
type WithoutTime<T> = T extends unknown ? Omit<T, "at"> : never;

/** A log line before `record` stamps it with the time. */
export type UnstampedActivity = WithoutTime<ClientActivity>;

export type ActivityReporter = {
  /** Stamps and queues one log line, then sends it (in order, one request at a time). */
  record(event: UnstampedActivity): void;
  /** Sends whatever is queued plus the current answers; resolves when done or failed. */
  flush(): Promise<void>;
  /** Like `flush`, but gives up waiting after `ms`. */
  flushWithin(ms: number): Promise<void>;
  stop(): void;
};

/** Plenty for a long offline stretch; the oldest lines go first beyond it. */
const MAX_QUEUE = 1000;
const RETRY_MS = 5_000;

/**
 * Feeds `POST /api/exams/activity`: the admin's log of answer changes and
 * connection drops, plus the server-side autosave of the current answers.
 * Lines that fail to send stay queued and go out with the next attempt.
 */
export function createActivityReporter(options: {
  sessionId: string;
  answers: () => number[];
  /** Added to this clock to get the server's (see `estimateClockOffset`). */
  clockOffset: number;
}): ActivityReporter {
  let queue: ClientActivity[] = [];
  let running: Promise<void> | null = null;
  let retryTimer: number | undefined;
  let stopped = false;

  /** True when the batch was handled (sent, or refused for good). */
  async function sendBatch(): Promise<boolean> {
    const batch = queue.slice(0, MAX_ACTIVITY_BATCH);
    try {
      const res = await fetch("/api/exams/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Lets the last lines go out while the page unloads.
        keepalive: true,
        body: JSON.stringify({
          sessionId: options.sessionId,
          answers: options.answers(),
          events: batch,
        }),
      });
      if (res.status >= 500 || res.status === 429) return false;
      // Sent, or a 4xx that retrying can't fix: either way these lines are done.
      queue = queue.slice(batch.length);
      const data = (await res.json().catch(() => null)) as { active?: unknown } | null;
      if (!res.ok || data?.active === false) stopped = true;
      return true;
    } catch {
      return false;
    }
  }

  function scheduleRetry() {
    if (stopped || retryTimer !== undefined) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      if (queue.length > 0) void flush();
    }, RETRY_MS);
  }

  function flush(): Promise<void> {
    if (stopped) return Promise.resolve();
    running ??= (async () => {
      do {
        if (!(await sendBatch())) {
          scheduleRetry();
          break;
        }
      } while (queue.length > 0 && !stopped);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    record(event) {
      if (stopped) return;
      queue.push({ ...event, at: Date.now() + options.clockOffset } as ClientActivity);
      if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
      void flush();
    },
    flush,
    flushWithin(ms) {
      return Promise.race([
        flush(),
        new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
      ]);
    },
    stop() {
      stopped = true;
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    },
  };
}
