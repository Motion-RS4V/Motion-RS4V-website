import { z } from "zod";
import { db } from "@/server/db";
import { emailProvider, senderAddress } from "@/server/email/providers";
import { renderStaffResetEmail } from "@/server/email/templates";
import { emailEnv } from "@/server/env";
import { clientIp, jsonError, jsonOk, readJson } from "@/server/http";
import { passwordSetupLink } from "@/server/owner/staff-accounts";
import { hitRateLimit } from "@/server/rate-limit";

const bodySchema = z.object({ email: z.email({ error: "Enter your work email." }) });

const GENERIC = "If that email belongs to a staff account, a reset link is on its way.";

/** Sends a password reset link. Answers the same either way, so it can't be used to discover staff emails. */
export async function POST(request: Request) {
  const limit = await hitRateLimit(db, `staff-reset:${clientIp(request.headers)}`, 5, 15 * 60);
  if (!limit.allowed) return jsonError(429, "Too many reset requests. Please wait a few minutes.");

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const email = parsed.data.email.toLowerCase();
  const profile = await db.staffProfile.findUnique({ where: { email }, select: { active: true } });
  if (profile?.active) {
    // Same hashed-token link the owner hands out from Team, rather than Supabase's own email:
    // that one only works in the browser that asked for it, and mail scanners can use it up before the person clicks.
    try {
      const env = emailEnv();
      const link = await passwordSetupLink(email);
      await emailProvider(env).send({ ...renderStaffResetEmail(link), to: email, from: senderAddress(env), idempotencyKey: crypto.randomUUID() });
    } catch (error) {
      console.error("staff password reset email failed", error instanceof Error ? error.message : error);
    }
  }
  return jsonOk({ message: GENERIC });
}
