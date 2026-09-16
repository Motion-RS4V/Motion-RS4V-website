import { z } from "zod";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { clientIp, jsonError, jsonOk, readJson } from "@/server/http";
import { hitRateLimit } from "@/server/rate-limit";
import { supabaseServer } from "@/server/staff/session";

const bodySchema = z.object({ email: z.email({ error: "Enter your work email." }) });

const GENERIC = "If that email belongs to a staff account, a reset link is on its way.";

/** Sends a password reset link. Answers the same either way, so it can't be used to discover staff emails. */
export async function POST(request: Request) {
  const limit = await hitRateLimit(db, `staff-reset:${clientIp(request.headers)}`, 5, 15 * 60);
  if (!limit.allowed) return jsonError(429, "Too many reset requests. Please wait a few minutes.");

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const profile = await db.staffProfile.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { active: true } });
  if (profile?.active) {
    const supabase = await supabaseServer();
    const redirectTo = `${serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/staff/reset`;
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
    if (error) console.error("staff password reset failed", error.message);
  }
  return jsonOk({ message: GENERIC });
}
