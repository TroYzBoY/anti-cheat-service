import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findSessionMock = vi.fn();
const countEventsMock = vi.fn();
const createEventMock = vi.fn();
const updateSessionsMock = vi.fn();
const updateAttemptsMock = vi.fn();

vi.mock("@/lib/prisma", () => {
  const tx = {
    examSession: { updateMany: (...args: unknown[]) => updateSessionsMock(...args) },
    examAttempt: { updateMany: (...args: unknown[]) => updateAttemptsMock(...args) },
  };
  return {
    prisma: {
      examSession: { findUnique: (...args: unknown[]) => findSessionMock(...args) },
      examIntegrityEvent: {
        count: (...args: unknown[]) => countEventsMock(...args),
        create: (...args: unknown[]) => createEventMock(...args),
      },
      auditLog: { create: vi.fn(async () => undefined) },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

import { OPTIONS, POST } from "./route";

const ORIGIN = "http://localhost:3000";
const secret = new TextEncoder().encode(process.env.ANTI_CHEAT_TOKEN_SECRET);

async function token(userId = "user-1", sessionId = "session-1") {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("codequest")
    .setAudience("codequest-anti-cheat")
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

async function post(
  body: unknown,
  { auth, origin = ORIGIN }: { auth?: string | null; origin?: string } = {},
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: origin,
  };
  const bearer = auth === undefined ? await token() : auth;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const request = new Request("http://localhost:3001/api/v1/events", {
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
    updateAttemptsMock.mockReset();
    updateAttemptsMock.mockResolvedValue({ count: 1 });
  });

  it("answers CORS preflight for allowed origins only", () => {
    const allowed = OPTIONS(
      new Request("http://x", { method: "OPTIONS", headers: { Origin: ORIGIN } }) as never,
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);

    const denied = OPTIONS(
      new Request("http://x", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      }) as never,
    );
    expect(denied.status).toBe(403);
  });

  it("rejects missing or forged tokens", async () => {
    expect((await post({ type: "devtools" }, { auth: null })).status).toBe(401);
    expect((await post({ type: "devtools" }, { auth: "forged" })).status).toBe(401);
  });

  it("rejects disallowed origins and bad payloads", async () => {
    expect((await post({ type: "devtools" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ type: "unknown" })).status).toBe(400);
  });

  it("refuses a session owned by someone else", async () => {
    findSessionMock.mockResolvedValue({ userId: "someone-else", status: "ACTIVE" });
    expect((await post({ type: "focus-loss" })).status).toBe(403);
  });

  it("records a focus loss below the limit without terminating", async () => {
    countEventsMock.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    const response = await post({ type: "focus-loss", clientCount: 2 });
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, active: true, count: 2, limit: 5, terminated: null });
    expect(createEventMock).toHaveBeenCalledOnce();
    expect(updateSessionsMock).not.toHaveBeenCalled();
  });

  it("bans the attempt when the client tally reaches the limit", async () => {
    countEventsMock.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
    const json = await (await post({ type: "focus-loss", clientCount: 5 })).json();
    expect(json).toMatchObject({ active: false, status: "TERMINATED", terminated: "focus-loss-limit" });
    expect(updateAttemptsMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: "BANNED" }) }),
    );
  });

  it("terminates immediately on devtools", async () => {
    const json = await (await post({ type: "devtools", metadata: { method: "debugger-trap" } })).json();
    expect(json.terminated).toBe("devtools");
    expect(updateAttemptsMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: "TERMINATED" }) }),
    );
  });

  it("reports an already-finished session without recording", async () => {
    findSessionMock.mockResolvedValue({ userId: "user-1", status: "SUBMITTED" });
    const json = await (await post({ type: "focus-loss" })).json();
    expect(json).toMatchObject({ ok: true, recorded: false, active: false, status: "SUBMITTED" });
    expect(createEventMock).not.toHaveBeenCalled();
  });
});
