/**
 * Sends one real email through whichever provider `.env.local` selects, so a new
 * Resend or SES setup can be checked without making a booking.
 *
 *   npm run email:test -- you@example.com
 *
 * Nothing is written to the database: this is a delivery check, not a booking email.
 */
import "./load-env";

import { emailProvider, senderAddress } from "@/server/email/providers";
import { emailEnv } from "@/server/env";

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage: npm run email:test -- you@example.com");
    process.exitCode = 1;
    return;
  }

  const env = emailEnv();
  const provider = emailProvider(env);
  const from = senderAddress(env);
  const stamp = new Date().toISOString();

  console.log(`Sending via ${provider.name} from ${from} to ${to}…`);

  const { id } = await provider.send({
    to,
    from,
    subject: "Motion RS4V test email",
    html: `<p>This is a test email from the Motion RS4V booking system.</p><p style="color:#7a766f">Provider: ${provider.name} · ${stamp}</p>`,
    text: `This is a test email from the Motion RS4V booking system.\nProvider: ${provider.name}\n${stamp}`,
    idempotencyKey: `test-${stamp}`,
  });

  console.log(`Accepted. Message id: ${id}`);
  if (provider.name === "console") console.log("EMAIL_PROVIDER is console, so nothing was actually sent.");
}

main();
