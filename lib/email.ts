import "server-only";

import nodemailer from "nodemailer";

import { env } from "@/lib/env";

export class EmailNotConfiguredError extends Error {}

type Message = { to: string; subject: string; text: string; html: string };

let smtp: ReturnType<typeof nodemailer.createTransport> | null = null;

function smtpTransport() {
  smtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT === 587,
    auth: {
      user: env.SMTP_USER,
      // Google shows App Passwords as "abcd efgh ijkl mnop".
      pass: (env.SMTP_PASS ?? "").replace(/\s+/g, ""),
    },
  });
  return smtp;
}

/**
 * Sends one email: over SMTP when `SMTP_USER`/`SMTP_PASS` are set (e.g. a
 * Gmail App Password — no domain needed), else through Resend's HTTP API. With
 * neither, development prints the email to the server console so sign-up can
 * be tested locally; production refuses rather than pretend.
 */
export async function sendEmail(message: Message): Promise<void> {
  if (env.SMTP_USER && env.SMTP_PASS) {
    await smtpTransport().sendMail({
      from: env.EMAIL_FROM || `Fenrir <${env.SMTP_USER}>`,
      ...message,
    });
    return;
  }

  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Fenrir <onboarding@resend.dev>",
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
    }
    return;
  }

  if (env.NODE_ENV === "production") {
    throw new EmailNotConfiguredError("Neither SMTP nor RESEND_API_KEY is set.");
  }
  console.log(`[email:dev] to=${message.to} subject=${message.subject}\n${message.text}`);
}
