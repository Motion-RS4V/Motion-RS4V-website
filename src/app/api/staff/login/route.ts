import { z } from "zod";
import { db } from "@/server/db";
import { clientIp, jsonError, jsonOk, readJson } from "@/server/http";
import { hitRateLimit } from "@/server/rate-limit";
import { supabaseServer, touchLastLogin } from "@/server/staff/session";

const bodySchema = z.object({ email: z.email({ error: "Enter your work email." }), password: z.string().min(1, { error: "Enter your password." }) });

export async function POST(request: Request) {
  const limit = await hitRateLimit(db, `staff-login:${clientIp(request.headers)}`, 10, 15 * 60);
  if (!limit.allowed) return jsonError(429, "Too many sign-in attempts. Wait a few minutes and try again.");

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return jsonError(401, "That email and password don't match.");

  const profile = await db.staffProfile.findUnique({ where: { id: data.user.id }, select: { active: true, role: true } });
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return jsonError(403, "This account can't sign in. Ask the owner to enable it.");
  }

  await touchLastLogin(data.user.id);
  return jsonOk({ role: profile.role });
}
