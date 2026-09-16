import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** How long a manage link keeps working after its session ends. */
export const LINK_VALID_AFTER_SESSION_DAYS = 7;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new unguessable link token (256 bits). Only its hash is stored. */
export async function createManageToken(tx: Tx, booking: { id: string; slotEnd: Date }): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await tx.manageToken.create({
    data: {
      bookingId: booking.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(booking.slotEnd.getTime() + LINK_VALID_AFTER_SESSION_DAYS * 24 * 60 * 60_000),
    },
  });
  return token;
}

/** The booking a link opens, or null if the token is unknown or expired. */
export async function resolveManageToken(tx: Tx, token: string, now = new Date()): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const row = await tx.manageToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, bookingId: true, expiresAt: true } });
  if (!row || row.expiresAt <= now) return null;
  await tx.manageToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
  return row.bookingId;
}
