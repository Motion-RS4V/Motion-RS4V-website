import "server-only";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** Filter groups shown on the activity page, matched by action prefix. */
export const ACTIVITY_AREAS = {
  bookings: { label: "Bookings", prefixes: ["booking.", "seat."] },
  money: { label: "Refunds", prefixes: ["refund."] },
  venue: { label: "Fleet & blocks", prefixes: ["car.", "rig.", "block."] },
  owner: { label: "Settings & team", prefixes: ["settings.", "schedule.", "staff.", "customers."] },
} as const;
export type ActivityArea = keyof typeof ACTIVITY_AREAS;

export type ActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string | null;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
  createdAt: Date;
  bookingReference: string | null;
};

/** Newest first, 50 at a time. `before` is the id of the last entry already shown. */
export async function listActivity(
  db: PrismaClient,
  input: { area?: ActivityArea; before?: string; limit?: number },
): Promise<{ entries: ActivityEntry[]; nextCursor: string | null }> {
  const limit = input.limit ?? 50;
  const where: Prisma.AuditLogWhereInput = {};
  if (input.area) where.OR = ACTIVITY_AREAS[input.area].prefixes.map((p) => ({ action: { startsWith: p } }));
  if (input.before && /^\d+$/.test(input.before)) where.id = { lt: BigInt(input.before) };

  const rows = await db.auditLog.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1,
    select: { id: true, action: true, entityType: true, entityId: true, before: true, after: true, createdAt: true, actor: { select: { name: true } } },
  });
  const page = rows.slice(0, limit);

  const bookingIds = [...new Set(page.filter((r) => r.entityType === "booking").map((r) => r.entityId))];
  const references = new Map(
    (bookingIds.length ? await db.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, reference: true } }) : []).map((b) => [b.id, b.reference]),
  );

  return {
    entries: page.map((r) => ({
      id: r.id.toString(),
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actor: r.actor?.name ?? null,
      before: r.before,
      after: r.after,
      createdAt: r.createdAt,
      bookingReference: references.get(r.entityId) ?? null,
    })),
    nextCursor: rows.length > limit ? page[page.length - 1].id.toString() : null,
  };
}
