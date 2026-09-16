import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { emailEnv } from "@/server/env";
import { emailProvider, senderAddress, type EmailProvider } from "./providers";
import { renderEmail, type TemplateData, type TemplateName } from "./templates";

const MAX_ATTEMPTS = 5;

/**
 * Records an email, then tries to send it. Never throws: a booking must not fail because an email did.
 * Failed sends stay in `email_messages` for `retryFailedEmails`.
 */
export async function sendTemplateEmail<T extends TemplateName>(
  db: PrismaClient,
  input: { template: T; to: string | null | undefined; data: TemplateData[T]; bookingId?: string | null },
  provider?: EmailProvider,
): Promise<"SENT" | "FAILED" | "SKIPPED"> {
  let rendered;
  try {
    rendered = renderEmail(input.template, input.data);
  } catch (error) {
    console.error("email render failed", input.template, error);
    return "FAILED";
  }

  let chosen: EmailProvider;
  try {
    chosen = provider ?? emailProvider(emailEnv());
  } catch (error) {
    console.error("email provider unavailable", error);
    return "FAILED";
  }

  const message = await db.emailMessage.create({
    data: {
      bookingId: input.bookingId ?? null,
      toAddress: input.to ?? "",
      template: input.template,
      subject: rendered.subject,
      payload: input.data as unknown as Prisma.InputJsonValue,
      provider: chosen.name,
      status: input.to ? "PENDING" : "SKIPPED",
      error: input.to ? null : "No email address on the booking",
    },
  });
  if (!input.to) return "SKIPPED";

  return deliver(db, chosen, message.id, input.to, rendered);
}

async function deliver(
  db: PrismaClient,
  provider: EmailProvider,
  messageId: string,
  to: string,
  rendered: { subject: string; html: string; text: string },
): Promise<"SENT" | "FAILED"> {
  try {
    const { id } = await provider.send({ ...rendered, to, from: senderAddress(emailEnv()), idempotencyKey: messageId });
    await db.emailMessage.update({
      where: { id: messageId },
      data: { status: "SENT", providerMessageId: id, sentAt: new Date(), attempts: { increment: 1 }, error: null },
    });
    return "SENT";
  } catch (error) {
    await db.emailMessage.update({
      where: { id: messageId },
      data: { status: "FAILED", attempts: { increment: 1 }, error: error instanceof Error ? error.message.slice(0, 500) : "send failed" },
    });
    console.error("email send failed", messageId, error);
    return "FAILED";
  }
}

/** Retries failed emails (daily provider limits, outages). Run from the scheduled job. */
export async function retryFailedEmails(db: PrismaClient, now = new Date(), provider?: EmailProvider): Promise<number> {
  const due = await db.emailMessage.findMany({
    where: { status: "FAILED", attempts: { lt: MAX_ATTEMPTS }, createdAt: { gt: new Date(now.getTime() - 3 * 24 * 60 * 60_000) } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });
  const chosen = provider ?? emailProvider(emailEnv());
  let sent = 0;
  for (const m of due) {
    const rendered = renderEmail(m.template as TemplateName, m.payload as never);
    if ((await deliver(db, chosen, m.id, m.toAddress, rendered)) === "SENT") sent++;
  }
  return sent;
}
