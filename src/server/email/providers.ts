import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { EmailEnv } from "@/server/env";

export type OutgoingEmail = { to: string; from: string; subject: string; html: string; text: string; idempotencyKey: string };

export interface EmailProvider {
  readonly name: "resend" | "ses" | "console";
  send(email: OutgoingEmail): Promise<{ id: string }>;
}

/** Resend's shared test sender only delivers to the Resend account owner's address. Set EMAIL_FROM once a domain is verified. */
export const RESEND_TEST_SENDER = "Motion RS4V <onboarding@resend.dev>";

function resend(apiKey: string): EmailProvider {
  return {
    name: "resend",
    async send(email) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": email.idempotencyKey },
        body: JSON.stringify({ from: email.from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? body.name ?? "send failed"}`);
      return { id: body.id };
    },
  };
}

/**
 * Amazon SES. Cheaper per email than Resend once volume grows, and the sending domain is verified in AWS.
 * A new account is in the SES sandbox: it only delivers to addresses verified in the same AWS account,
 * and is capped at 200 emails a day until AWS grants production access.
 */
function ses(env: EmailEnv): EmailProvider {
  const client = new SESv2Client({
    region: env.SES_REGION,
    credentials: { accessKeyId: env.SES_ACCESS_KEY_ID, secretAccessKey: env.SES_SECRET_ACCESS_KEY },
  });
  return {
    name: "ses",
    async send(email) {
      const out = await client.send(
        new SendEmailCommand({
          FromEmailAddress: email.from,
          Destination: { ToAddresses: [email.to] },
          ConfigurationSetName: env.SES_CONFIGURATION_SET || undefined,
          Content: {
            Simple: {
              Subject: { Data: email.subject, Charset: "UTF-8" },
              Body: { Html: { Data: email.html, Charset: "UTF-8" }, Text: { Data: email.text, Charset: "UTF-8" } },
            },
          },
        }),
      );
      // SES has no idempotency key, so a retry after a timeout can send twice. Sends are logged in `email_messages`.
      if (!out.MessageId) throw new Error("SES accepted the request but returned no message id");
      return { id: out.MessageId };
    },
  };
}

/** Development fallback: prints the email instead of sending it. */
const consoleProvider: EmailProvider = {
  name: "console",
  async send(email) {
    console.info(`\n── email (not sent: EMAIL_PROVIDER=console) ──\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n──────────────\n`);
    return { id: `console-${email.idempotencyKey}` };
  },
};

export function emailProvider(env: EmailEnv): EmailProvider {
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) {
      console.warn("EMAIL_PROVIDER=resend but RESEND_API_KEY is empty; printing emails to the console instead.");
      return consoleProvider;
    }
    return resend(env.RESEND_API_KEY);
  }
  if (env.EMAIL_PROVIDER === "ses") {
    if (!env.SES_ACCESS_KEY_ID || !env.SES_SECRET_ACCESS_KEY) {
      console.warn("EMAIL_PROVIDER=ses but SES_ACCESS_KEY_ID/SES_SECRET_ACCESS_KEY are empty; printing emails to the console instead.");
      return consoleProvider;
    }
    return ses(env);
  }
  return consoleProvider;
}

export function senderAddress(env: EmailEnv): string {
  if (env.EMAIL_FROM) return env.EMAIL_FROM;
  // SES only sends from an address or domain verified in the AWS account, so there is no shared test sender.
  if (env.EMAIL_PROVIDER === "ses") throw new Error("EMAIL_PROVIDER=ses needs EMAIL_FROM set to a verified SES sender.");
  return RESEND_TEST_SENDER;
}
