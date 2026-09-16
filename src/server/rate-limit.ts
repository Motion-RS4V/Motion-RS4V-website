import type { PrismaClient } from "@/generated/prisma/client";

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in Postgres. One atomic upsert per hit, so parallel requests can't slip past the limit.
 * Good enough for a single venue; swap for Redis if traffic ever needs it.
 */
export async function hitRateLimit(
  db: PrismaClient,
  key: string,
  limit: number,
  windowSeconds: number,
  now = new Date(),
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db.$queryRaw<{ count: number }[]>`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`;
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);
  return { allowed: row.count <= limit, count: row.count, retryAfterSeconds };
}

export async function pruneRateLimits(db: PrismaClient, now = new Date()): Promise<number> {
  const { count } = await db.rateLimitHit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } });
  return count;
}
