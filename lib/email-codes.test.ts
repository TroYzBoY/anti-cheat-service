import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: {
  id: string;
  email: string;
  purpose: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}[] = [];
const sent: { to: string; text: string }[] = [];
let sendFails = false;

vi.mock("@/lib/email", () => ({
  EmailNotConfiguredError: class extends Error {},
  sendEmail: async (message: { to: string; text: string }) => {
    if (sendFails) throw new Error("boom");
    sent.push(message);
  },
}));

vi.mock("@/lib/prisma", () => {
  const match = (row: (typeof rows)[number], where: Record<string, unknown>) =>
    (where.email === undefined || row.email === where.email) &&
    (where.purpose === undefined || row.purpose === where.purpose) &&
    (where.id === undefined || row.id === where.id);
  const newest = () => [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return {
    prisma: {
      emailCode: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          newest().filter((row) => match(row, where)),
        // A copy, like Prisma: later updates must not change what was read.
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          const row = newest().find((r) => match(r, where));
          return row ? { ...row } : null;
        },
        create: async ({ data }: { data: Omit<(typeof rows)[number], "id" | "attempts" | "usedAt" | "createdAt"> }) => {
          const row = { id: `c${rows.length}`, attempts: 0, usedAt: null, createdAt: new Date(), ...data };
          rows.push(row);
          return { id: row.id };
        },
        update: async ({ where }: { where: { id: string } }) => {
          const row = rows.find((r) => r.id === where.id)!;
          row.attempts += 1;
          return row;
        },
        updateMany: async ({ where }: { where: { id: string } }) => {
          const row = rows.find((r) => r.id === where.id && r.usedAt === null);
          if (row) row.usedAt = new Date();
          return { count: row ? 1 : 0 };
        },
        delete: async ({ where }: { where: { id: string } }) => {
          rows.splice(rows.findIndex((r) => r.id === where.id), 1);
        },
        deleteMany: async () => ({ count: 0 }),
      },
    },
  };
});

import { consumeCode, hashCode, issueCode } from "./email-codes";

const EMAIL = "a@example.com";
const sentCode = () => sent[sent.length - 1].text.match(/Код: (\d{6})/)![1];

describe("email codes", () => {
  beforeEach(() => {
    rows.length = 0;
    sent.length = 0;
    sendFails = false;
  });

  it("hashes per purpose and email", () => {
    expect(hashCode(EMAIL, "VERIFY_EMAIL", "123456")).not.toBe(
      hashCode(EMAIL, "RESET_PASSWORD", "123456"),
    );
    expect(hashCode(EMAIL, "VERIFY_EMAIL", "123456")).not.toBe(
      hashCode("b@example.com", "VERIFY_EMAIL", "123456"),
    );
  });

  it("emails a 6-digit code, stores only its hash, and accepts it once", async () => {
    expect(await issueCode(EMAIL, "VERIFY_EMAIL")).toEqual({ ok: true });
    const code = sentCode();
    expect(rows[0].codeHash).not.toContain(code);
    expect(await consumeCode(EMAIL, "RESET_PASSWORD", code)).toBe("expired");
    expect(await consumeCode(EMAIL, "VERIFY_EMAIL", code)).toBe("ok");
    expect(await consumeCode(EMAIL, "VERIFY_EMAIL", code)).toBe("expired");
  });

  it("refuses a second code within a minute", async () => {
    await issueCode(EMAIL, "VERIFY_EMAIL");
    const again = await issueCode(EMAIL, "VERIFY_EMAIL");
    expect(again.ok).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("burns the code after five wrong guesses", async () => {
    await issueCode(EMAIL, "RESET_PASSWORD");
    const code = sentCode();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) {
      expect(await consumeCode(EMAIL, "RESET_PASSWORD", wrong)).toBe("invalid");
    }
    expect(await consumeCode(EMAIL, "RESET_PASSWORD", wrong)).toBe("expired");
    expect(await consumeCode(EMAIL, "RESET_PASSWORD", code)).toBe("expired");
  });

  it("rejects an expired code", async () => {
    await issueCode(EMAIL, "VERIFY_EMAIL");
    rows[0].expiresAt = new Date(Date.now() - 1000);
    expect(await consumeCode(EMAIL, "VERIFY_EMAIL", sentCode())).toBe("expired");
  });

  it("forgets a code whose email failed, so the learner can retry", async () => {
    sendFails = true;
    await expect(issueCode(EMAIL, "VERIFY_EMAIL")).rejects.toThrow("boom");
    expect(rows).toHaveLength(0);
    sendFails = false;
    expect(await issueCode(EMAIL, "VERIFY_EMAIL")).toEqual({ ok: true });
  });
});
