import { describe, expect, it } from "vitest";

import {
  activityBatchSchema,
  alignAnswerColumns,
  breakdownQuestions,
  describeEntry,
  describeUserAgent,
  estimateClockOffset,
  excerpt,
  finalAnswers,
  formatDateTime,
  formatDuration,
  formatHistory,
  logCategory,
  type LogEntry,
} from "./exam-activity";

const START = new Date("2026-10-09T05:00:00Z");

function entry(overrides: Partial<LogEntry> & { at: Date }): LogEntry {
  return {
    id: `id-${overrides.at.getTime()}`,
    sessionId: "s1",
    source: "activity",
    type: "answer",
    questionIndex: null,
    choiceIndex: null,
    previousIndex: null,
    ip: null,
    userAgent: null,
    metadata: null,
    ...overrides,
  };
}

const after = (seconds: number) => new Date(START.getTime() + seconds * 1000);

const attempt = {
  questions: [
    { id: "q1", prompt: "2 + 2 = ?", choices: ["3", "4", "5", "22"] },
    { id: "q2", prompt: "Нийслэл?", choices: ["Дархан", "Улаанбаатар"] },
  ],
  answerKey: [1, 1],
};

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(75_000)).toBe("1:15");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00");
  });

  it("prints Ulaanbaatar time", () => {
    expect(formatDateTime(START)).toBe("2026-10-09 13:00:00");
    expect(formatDateTime(null)).toBe("");
  });

  it("names the browser, OS and Safe Exam Browser", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0 SEB/3.7.1",
      ),
    ).toBe("SEB 3.7.1 · Edge 126 · Windows 10/11");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      ),
    ).toBe("Safari 17 · macOS");
    expect(describeUserAgent(null)).toBe("—");
  });

  it("prints a choice history", () => {
    expect(formatHistory([1, 3, -1])).toBe("Б → Г → —");
  });

  it("shortens a multi-line question to one line", () => {
    expect(excerpt("Дараах код юу хэвлэх вэ?\n\nprint(type(3.0))")).toBe(
      "Дараах код юу хэвлэх вэ? print(type(3.0))",
    );
    expect(excerpt("abcdef", 4)).toBe("abc…");
  });
});

describe("activityBatchSchema", () => {
  it("accepts answer and connection events", () => {
    const parsed = activityBatchSchema.safeParse({
      sessionId: "s1",
      answers: [1, -1],
      events: [
        { type: "answer", questionIndex: 0, choiceIndex: 1, previousIndex: -1, at: 1 },
        { type: "online", at: 2, offlineMs: 3000 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range choices and unknown types", () => {
    const base = { sessionId: "s1" };
    expect(
      activityBatchSchema.safeParse({
        ...base,
        events: [{ type: "answer", questionIndex: 0, choiceIndex: 8, previousIndex: -1, at: 1 }],
      }).success,
    ).toBe(false);
    expect(
      activityBatchSchema.safeParse({ ...base, events: [{ type: "submitted", at: 1 }] }).success,
    ).toBe(false);
  });
});

describe("estimateClockOffset", () => {
  it("cancels out the network delay", () => {
    // Page clock 10 s behind; 100 ms each way; 300 ms on the server.
    const requestedAt = 1_000_000;
    const serverTime = { receivedAt: requestedAt + 10_100, sentAt: requestedAt + 10_400 };
    expect(estimateClockOffset(requestedAt, requestedAt + 500, serverTime)).toBe(10_000);
  });

  it("is zero without the server's times", () => {
    expect(estimateClockOffset(1, 2, undefined)).toBe(0);
  });
});

describe("finalAnswers", () => {
  const base = { answerKey: [0, 1], answers: [] as number[], draftAnswers: [] as number[] };

  it("prefers the submitted answers", () => {
    expect(finalAnswers({ ...base, status: "SUBMITTED", answers: [0, 1], draftAnswers: [1, 1] })).toEqual([0, 1]);
  });

  it("falls back to the autosaved draft of an unfinished attempt", () => {
    expect(finalAnswers({ ...base, status: "TERMINATED", draftAnswers: [1, -1] })).toEqual([1, -1]);
  });

  it("reports nothing answered when nothing was kept", () => {
    expect(finalAnswers({ ...base, status: "TERMINATED" })).toEqual([-1, -1]);
  });
});

describe("breakdownQuestions", () => {
  it("times each question from the previous answer and counts changes", () => {
    const log = [
      entry({ at: after(40), questionIndex: 0, choiceIndex: 1, previousIndex: 0 }),
      entry({ at: after(10), questionIndex: 0, choiceIndex: 0, previousIndex: -1 }),
      entry({ at: after(30), source: "integrity", type: "multi-monitor" }),
      entry({ at: after(25), questionIndex: 1, choiceIndex: 0, previousIndex: -1 }),
    ];
    const [first, second] = breakdownQuestions({
      answerKey: attempt.answerKey,
      finalAnswers: [1, 0],
      startedAt: START,
      log,
    });

    expect(first).toMatchObject({
      final: 1,
      correct: true,
      firstAnsweredAt: after(10),
      lastChangedAt: after(40),
      changes: 1,
      timeSpentMs: 25_000,
      history: [0, 1],
    });
    expect(second).toMatchObject({ final: 0, correct: false, changes: 0, timeSpentMs: 15_000 });
  });
});

describe("describeEntry", () => {
  it("describes an answer change and whether it is right", () => {
    const described = describeEntry(
      entry({ at: after(5), questionIndex: 0, choiceIndex: 1, previousIndex: 0 }),
      attempt,
    );
    expect(described).toEqual({
      label: "Хариулт сонгосон",
      detail: "1-р асуулт: А. 3 → Б. 4",
      category: "answer",
      correct: true,
    });
  });

  it("describes a cleared answer", () => {
    const described = describeEntry(
      entry({ at: after(5), questionIndex: 1, choiceIndex: -1, previousIndex: 0 }),
      attempt,
    );
    expect(described).toMatchObject({ label: "Хариултаа арилгасан", correct: null });
    expect(described.detail).toBe("2-р асуулт: А. Дархан → —");
  });

  it("describes submits, ends and anti-cheat signals", () => {
    expect(
      describeEntry(
        entry({
          at: after(60),
          type: "submitted",
          metadata: { auto: true, answered: 2, total: 2, correct: 1, scorePercent: 50 },
        }),
        attempt,
      ).detail,
    ).toBe("Хугацаа дуусахад автоматаар · 2/2 хариулсан · 1/2 зөв (50%)");
    expect(
      describeEntry(
        entry({ at: after(60), type: "terminated", metadata: { reason: "screenshot" } }),
        attempt,
      ).detail,
    ).toBe("Print Screen дарсан (дэлгэцийн зураг)");

    const focus = describeEntry(
      entry({ at: after(9), source: "integrity", type: "focus-loss", metadata: { via: "tab-hidden" } }),
      attempt,
    );
    expect(focus).toMatchObject({ label: "Цонхноос гарсан (focus)", detail: "tab нуугдсан", category: "violation" });
  });

  it("files connection drops under network", () => {
    expect(logCategory({ source: "activity", type: "offline" })).toBe("network");
    expect(
      describeEntry(entry({ at: after(9), type: "online", metadata: { offlineMs: 65_000 } }), attempt)
        .detail,
    ).toBe("1:05 тасарсан");
  });
});

describe("alignAnswerColumns", () => {
  it("matches questions across re-saves and shuffles, and appends removed ones", () => {
    const items = [
      { id: "new-a", prompt: "A?", choices: ["1", "2"], correctIndex: 0 },
      { id: "new-b", prompt: "B?", choices: ["x", "y", "z"], correctIndex: 2 },
    ];
    const attempts = [
      {
        // Taken before the exam was re-saved: old ids, shuffled order and choices.
        questions: [
          { id: "old-b", prompt: "B?", choices: ["z", "x", "y"] },
          { id: "old-a", prompt: "A?", choices: ["2", "1"] },
          { id: "old-c", prompt: "C (removed)?", choices: ["yes", "no"] },
        ],
        answerKey: [0, 1, 1],
      },
      {
        questions: [{ id: "new-a", prompt: "A?", choices: ["1", "2"] }],
        answerKey: [0],
      },
    ];

    const { columns, positions } = alignAnswerColumns(items, attempts);
    expect(columns).toEqual([
      { prompt: "A?", correctText: "1" },
      { prompt: "B?", correctText: "z" },
      { prompt: "C (removed)?", correctText: "no" },
    ]);
    expect(positions).toEqual([[1, 0, 2], [0]]);
  });
});
