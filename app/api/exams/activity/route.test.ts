import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const findSessionMock = vi.fn();
const updateSessionsMock = vi.fn();
const countActivitiesMock = vi.fn();
const createActivitiesMock = vi.fn();

vi.mock("@/lib/auth", () => ({
  getUserFromRequest: (...args: unknown[]) => getUserMock(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    examSession: {
      findUnique: (...args: unknown[]) => findSessionMock(...args),
      updateMany: (...args: unknown[]) => updateSessionsMock(...args),
    },
    examActivity: {
      count: (...args: unknown[]) => countActivitiesMock(...args),
      createMany: (...args: unknown[]) => createActivitiesMock(...args),
    },
  },
}));

import { POST } from "./route";

const APP = "http://localhost:3001";
const NOW = new Date("2026-10-09T05:00:00Z").getTime();

function post(body: unknown, { origin = APP }: { origin?: string } = {}) {
  const request = new Request(`${APP}/api/exams/activity`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Forwarded-For": "203.0.113.5, 10.0.0.1",
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
  return POST(request);
}

function answer(questionIndex: number, choiceIndex: number, at: number) {
  return { type: "answer", questionIndex, choiceIndex, previousIndex: -1, at };
}

describe("POST /api/exams/activity", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ id: "user-1", role: "LEARNER" });
    findSessionMock.mockReset();
    findSessionMock.mockResolvedValue({
      userId: "user-1",
      status: "ACTIVE",
      startedAt: new Date(NOW - 10 * 60_000),
      submittedAt: null,
      answerKey: [0, 1, 2],
    });
    updateSessionsMock.mockReset();
    updateSessionsMock.mockResolvedValue({ count: 1 });
    countActivitiesMock.mockReset();
    countActivitiesMock.mockResolvedValue(0);
    createActivitiesMock.mockReset();
    createActivitiesMock.mockImplementation(({ data }: { data: unknown[] }) =>
      Promise.resolve({ count: data.length }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("needs a signed-in owner, the same origin and a valid body", async () => {
    const body = { sessionId: "session-1", events: [] };
    expect((await post(body, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ sessionId: "session-1" })).status).toBe(400);

    getUserMock.mockResolvedValueOnce(null);
    expect((await post(body)).status).toBe(401);

    findSessionMock.mockResolvedValueOnce({ userId: "someone-else", status: "ACTIVE" });
    expect((await post(body)).status).toBe(403);
  });

  it("logs events at their time, from the caller's IP, and autosaves the draft", async () => {
    const res = await post({
      sessionId: "session-1",
      answers: [1, -1, -1],
      events: [answer(0, 1, NOW - 2_000), { type: "online", at: NOW - 1_000, offlineMs: 4_000 }],
    });

    expect(await res.json()).toEqual({ ok: true, active: true, recorded: 2 });
    expect(createActivitiesMock).toHaveBeenCalledWith({
      data: [
        {
          sessionId: "session-1",
          type: "answer",
          questionIndex: 0,
          choiceIndex: 1,
          previousIndex: -1,
          ip: "203.0.113.5",
          createdAt: new Date(NOW - 2_000),
        },
        {
          sessionId: "session-1",
          type: "online",
          ip: "203.0.113.5",
          metadata: { offlineMs: 4_000 },
          createdAt: new Date(NOW - 1_000),
        },
      ],
    });
    expect(updateSessionsMock).toHaveBeenCalledWith({
      where: { id: "session-1", status: "ACTIVE" },
      data: { lastSeenAt: new Date(NOW), draftAnswers: [1, -1, -1] },
    });
  });

  it("keeps event times inside the attempt", async () => {
    await post({
      sessionId: "session-1",
      events: [answer(0, 1, NOW - 60 * 60_000), answer(1, 1, NOW + 60_000)],
    });
    expect(createActivitiesMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ createdAt: new Date(NOW - 10 * 60_000) }),
        expect.objectContaining({ createdAt: new Date(NOW) }),
      ],
    });
  });

  it("treats an empty batch as a heartbeat", async () => {
    await post({ sessionId: "session-1", answers: [0, 0], events: [] });
    expect(createActivitiesMock).not.toHaveBeenCalled();
    // Two answers for a three-question attempt: the draft is left alone.
    expect(updateSessionsMock).toHaveBeenCalledWith({
      where: { id: "session-1", status: "ACTIVE" },
      data: { lastSeenAt: new Date(NOW) },
    });
  });

  it("drops answers to questions the attempt doesn't have", async () => {
    const res = await post({ sessionId: "session-1", events: [answer(7, 0, NOW)] });
    expect(await res.json()).toMatchObject({ recorded: 0 });
    expect(createActivitiesMock).not.toHaveBeenCalled();
  });

  it("keeps lines from just before a finished attempt ended, and nothing after", async () => {
    findSessionMock.mockResolvedValue({
      userId: "user-1",
      status: "SUBMITTED",
      startedAt: new Date(NOW - 10 * 60_000),
      submittedAt: new Date(NOW - 10_000),
      answerKey: [0, 1, 2],
    });
    const res = await post({
      sessionId: "session-1",
      answers: [2, 2, 2],
      events: [answer(0, 2, NOW - 15_000), answer(1, 2, NOW - 5_000)],
    });

    expect(await res.json()).toEqual({ ok: true, active: false, recorded: 1 });
    expect(createActivitiesMock).toHaveBeenCalledWith({
      data: [expect.objectContaining({ questionIndex: 0, createdAt: new Date(NOW - 15_000) })],
    });
    expect(updateSessionsMock).not.toHaveBeenCalled();
  });

  it("ignores lines that arrive long after the end", async () => {
    findSessionMock.mockResolvedValue({
      userId: "user-1",
      status: "TERMINATED",
      startedAt: new Date(NOW - 10 * 60_000),
      submittedAt: new Date(NOW - 5 * 60_000),
      answerKey: [0, 1, 2],
    });
    await post({ sessionId: "session-1", events: [answer(0, 2, NOW - 400_000)] });
    expect(createActivitiesMock).not.toHaveBeenCalled();
  });

  it("stops at the per-attempt cap", async () => {
    countActivitiesMock.mockResolvedValue(2_999);
    const res = await post({
      sessionId: "session-1",
      events: [answer(0, 1, NOW - 2_000), answer(1, 1, NOW - 1_000)],
    });
    expect(await res.json()).toMatchObject({ recorded: 1 });
    expect(createActivitiesMock.mock.calls[0][0].data).toHaveLength(1);
  });
});
