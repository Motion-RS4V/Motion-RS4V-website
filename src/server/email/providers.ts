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
    // Wired up before launch, when the Amazon SES account and domain are ready.
    throw new Error("EMAIL_PROVIDER=ses isn't configured yet. Use resend or console for now.");
  }
  return consoleProvider;
}

export function senderAddress(env: EmailEnv): string {
  return env.EMAIL_FROM || RESEND_TEST_SENDER;
}
