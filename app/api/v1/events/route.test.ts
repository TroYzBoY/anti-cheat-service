import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAntiCheatToken } from "@/lib/token";

const findSessionMock = vi.fn();
const countEventsMock = vi.fn();
const createEventMock = vi.fn();
const updateSessionsMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    examSession: {
      findUnique: (...args: unknown[]) => findSessionMock(...args),
      updateMany: (...args: unknown[]) => updateSessionsMock(...args),
    },
    examIntegrityEvent: {
      count: (...args: unknown[]) => countEventsMock(...args),
      create: (...args: unknown[]) => createEventMock(...args),
    },
  },
}));

import { POST } from "./route";

const APP = "http://localhost:3001";

function token(userId = "user-1", sessionId = "session-1") {
  return createAntiCheatToken({
    userId,
    sessionId,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
}

async function post(
  body: unknown,
  { auth, origin = APP }: { auth?: string | null; origin?: string } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: origin,
  };
  const bearer = auth === undefined ? await token() : auth;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const request = new Request(`${APP}/api/v1/events`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
  return POST(request);
}

describe("POST /api/v1/events", () => {
  beforeEach(() => {
    findSessionMock.mockReset();
    findSessionMock.mockResolvedValue({ userId: "user-1", status: "ACTIVE" });
    countEventsMock.mockReset();
    countEventsMock.mockResolvedValue(0);
    createEventMock.mockReset();
    createEventMock.mockResolvedValue({});
    updateSessionsMock.mockReset();
    updateSessionsMock.mockResolvedValue({ count: 1 });
  });

  it("rejects missing or forged tokens", async () => {
    expect((await post({ type: "devtools" }, { auth: null })).status).toBe(401);
    expect((await post({ type: "devtools" }, { auth: "forged" })).status).toBe(401);
  });

  it("rejects other origins and bad payloads", async () => {
    expect((await post({ type: "devtools" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ type: "unknown" })).status).toBe(400);
  });

  it("refuses a session owned by someone else", async () => {
    findSessionMock.mockResolvedValue({ userId: "someone-else", status: "ACTIVE" });
    expect((await post({ type: "focus-loss" })).status).toBe(403);
  });

  it("records a focus loss below the limit without terminating", async () => {
    countEventsMock.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const json = await (await post({ type: "focus-loss", clientCount: 2 })).json();
    expect(json).toMatchObject({ ok: true, active: true, count: 2, limit: 3, terminated: null });
    expect(createEventMock).toHaveBeenCalledOnce();
    expect(updateSessionsMock).not.toHaveBeenCalled();
  });

  it("bans the attempt on the third focus loss", async () => {
    countEventsMock.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const json = await (await post({ type: "focus-loss", clientCount: 3 })).json();
    expect(json).toMatchObject({ active: false, status: "TERMINATED", terminated: "focus-loss-limit" });
    expect(updateSessionsMock).toHaveBeenCalledWith({
      where: { id: "session-1", status: "ACTIVE" },
      data: expect.objectContaining({
        status: "TERMINATED",
        outcome: "BANNED",
        terminationReason: "focus-loss-limit",
        scorePercent: 0,
      }),
    });
  });

  it("terminates immediately on devtools", async () => {
    const json = await (await post({ type: "devtools", metadata: { method: "debugger-trap" } })).json();
    expect(json.terminated).toBe("devtools");
    expect(updateSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: "TERMINATED" }) }),
    );
  });

  it("bans the attempt on Print Screen", async () => {
    const json = await (await post({ type: "screenshot" })).json();
    expect(json).toMatchObject({ active: false, terminated: "screenshot" });
    expect(updateSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: "BANNED", terminationReason: "screenshot" }),
      }),
    );
  });

  it("reports an already-finished session without recording", async () => {
    findSessionMock.mockResolvedValue({ userId: "user-1", status: "SUBMITTED" });
    const json = await (await post({ type: "focus-loss" })).json();
    expect(json).toMatchObject({ ok: true, recorded: false, active: false, status: "SUBMITTED" });
    expect(createEventMock).not.toHaveBeenCalled();
  });
});
