import "server-only";

import crypto from "node:crypto";

import { EmailNotConfiguredError, sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/enforcement";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export type CodePurpose = "VERIFY_EMAIL" | "RESET_PASSWORD";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

/** HMAC so a database leak doesn't hand out live codes. */
export function hashCode(email: string, purpose: CodePurpose, code: string) {
  return crypto
    .createHmac("sha256", env.AUTH_SECRET)
    .update(`${purpose}:${email}:${code}`)
    .digest("hex");
}

const COPY: Record<CodePurpose, { subject: string; lead: string }> = {
  VERIFY_EMAIL: {
    subject: "Fenrir — бүртгэл баталгаажуулах код",
    lead: "Бүртгэлээ баталгаажуулахын тулд доорх кодыг оруулна уу.",
  },
  RESET_PASSWORD: {
    subject: "Fenrir — нууц үг сэргээх код",
    lead: "Нууц үгээ сэргээхийн тулд доорх кодыг оруулна уу. Та хүсэлт гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу.",
  },
};

export type IssueResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Email a fresh 6-digit code. At most one per minute and five per hour per
 * email and purpose; the newest code replaces any earlier one.
 */
export async function issueCode(email: string, purpose: CodePurpose): Promise<IssueResult> {
  const now = Date.now();
  const recent = await prisma.emailCode.findMany({
    where: { email, purpose, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const last = recent[0]?.createdAt.getTime();
  if (last && now - last < RESEND_COOLDOWN_MS) {
    return { ok: false, retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000) };
  }
  if (recent.length >= MAX_CODES_PER_HOUR) {
    const oldest = recent[recent.length - 1].createdAt.getTime();
    return { ok: false, retryAfterSeconds: Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000) };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const row = await prisma.emailCode.create({
    select: { id: true },
    data: {
      email,
      purpose,
      codeHash: hashCode(email, purpose, code),
      expiresAt: new Date(now + CODE_TTL_MS),
    },
  });
  // Old rows are only needed for the hourly cap.
  await prisma.emailCode.deleteMany({
    where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } },
  });

  const { subject, lead } = COPY[purpose];
  try {
    await sendEmail({
      to: email,
      subject,
      text: `${lead}\n\nКод: ${code}\n\nКод 10 минутын дотор хүчинтэй.`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
  <h2 style="margin:0 0 12px">Fenrir</h2>
  <p>${lead}</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
  <p style="color:#666">Код 10 минутын дотор хүчинтэй.</p>
</div>`,
    });
  } catch (error) {
    // The learner never got this code, so it mustn't start the cooldown.
    await prisma.emailCode.delete({ where: { id: row.id } }).catch(() => undefined);
    throw error;
  }
  return { ok: true };
}

export type CheckResult = "ok" | "invalid" | "expired";

/**
 * Check the newest code for `email`/`purpose`. Five wrong tries burn it; a
 * correct one is consumed so it can't be reused.
 */
export async function consumeCode(
  email: string,
  purpose: CodePurpose,
  code: string,
): Promise<CheckResult> {
  const latest = await prisma.emailCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (
    !latest ||
    latest.usedAt ||
    latest.expiresAt.getTime() < Date.now() ||
    latest.attempts >= MAX_ATTEMPTS
  ) {
    return "expired";
  }

  const expected = Buffer.from(latest.codeHash, "hex");
  const actual = Buffer.from(hashCode(email, purpose, code), "hex");
  if (!crypto.timingSafeEqual(expected, actual)) {
    await prisma.emailCode.update({
      where: { id: latest.id },
      data: { attempts: { increment: 1 } },
    });
    return latest.attempts + 1 >= MAX_ATTEMPTS ? "expired" : "invalid";
  }

  // Guarded so two simultaneous submits can't both use the same code.
  const { count } = await prisma.emailCode.updateMany({
    where: { id: latest.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? "ok" : "expired";
}

/**
 * Email a code for a route handler: null when sent (or, with
 * `cooldownIsSent`, when one went out under a minute ago), else the error
 * response to return.
 */
export async function sendCodeOrError(
  email: string,
  purpose: CodePurpose,
  { cooldownIsSent = false } = {},
): Promise<Response | null> {
  try {
    const result = await issueCode(email, purpose);
    if (result.ok || (cooldownIsSent && result.retryAfterSeconds <= 60)) return null;
    return jsonError(CODE_MESSAGES.cooldown(result.retryAfterSeconds), 429, {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  } catch (error) {
    if (error instanceof EmailNotConfiguredError) {
      return jsonError(CODE_MESSAGES.notConfigured, 503);
    }
    logEvent("email_send_failed", {
      purpose,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(CODE_MESSAGES.sendFailed, 502);
  }
}

export const CODE_MESSAGES = {
  invalid: "Код буруу байна.",
  expired: "Кодын хугацаа дууссан эсвэл хэт олон удаа буруу оруулсан. Шинэ код авна уу.",
  cooldown: (seconds: number) => `Шинэ код авахын тулд ${seconds} секунд хүлээнэ үү.`,
  notConfigured: "Имэйл илгээх тохиргоо хийгдээгүй байна. Админд хандана уу.",
  sendFailed: "Имэйл илгээж чадсангүй. Хэсэг хугацааны дараа дахин оролдоно уу.",
};
