import { timingSafeEqual } from "node:crypto";
import { completeFinishedSessions, expireHolds, markNoShows } from "@/server/booking";
import { db } from "@/server/db";
import { retryFailedEmails } from "@/server/email/send";
import { jobsEnv } from "@/server/env";
import { paymentGateway, syncPendingRefunds } from "@/server/payments";
import { pruneRateLimits } from "@/server/rate-limit";

/**
 * Housekeeping, meant to be called every few minutes by the host's scheduler with
 * `Authorization: Bearer <CRON_SECRET>`: expire unpaid holds, mark no-shows, retry failed emails.
 */
export async function POST(request: Request) {
  const expected = Buffer.from(`Bearer ${jobsEnv().CRON_SECRET}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const expiredHolds = await expireHolds(db, now);
  const noShowSeats = await markNoShows(db, now);
  const sessionsCompleted = await completeFinishedSessions(db, now);
  const emailsRetried = await retryFailedEmails(db, now);
  const rateLimitRowsPruned = await pruneRateLimits(db, now);
  const refunds = await syncPendingRefunds(db, paymentGateway(), { now });
  return Response.json({ ok: true, expiredHolds, noShowSeats, sessionsCompleted, emailsRetried, rateLimitRowsPruned, refunds });
}
