import "server-only";

import { env } from "@/lib/env";

export class EmailNotConfiguredError extends Error {}

const DEFAULT_FROM = "Fenrir <onboarding@resend.dev>";

/**
 * Sends one email through Resend's HTTP API. In development without
 * `RESEND_API_KEY` the email is printed to the server console instead, so
 * sign-up can be tested locally; production refuses rather than pretend.
 */
export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") {
      throw new EmailNotConfiguredError("RESEND_API_KEY is not set.");
    }
    console.log(`[email:dev] to=${message.to} subject=${message.subject}\n${message.text}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || DEFAULT_FROM,
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
}
