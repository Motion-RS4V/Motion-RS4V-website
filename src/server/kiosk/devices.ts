import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/server/env";

type Db = PrismaClient;

/** The kiosk screen keeps this cookie; only its hash is stored, like a manage link. */
export const KIOSK_COOKIE = "rs4v_kiosk";

/** A pairing link is meant to be opened on the screen straight away. */
export const PAIRING_VALID_MINUTES = 30;

/** Long enough that staff never re-pair the screen in normal use. */
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** `lastSeenAt` is for the owner's list, not an audit trail, so it isn't written on every page view. */
const LAST_SEEN_THROTTLE_MS = 5 * 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type KioskDeviceRow = {
  id: string;
  label: string;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  pairedBy: { name: string } | null;
  paired: boolean;
};

/**
 * Registers a screen and returns the one link that pairs it. The link carries the device's token,
 * so it is shown once and opened on the screen itself; after that the token lives only in the cookie.
 */
export async function createKioskDevice(db: Db, input: { label: string; actorId: string }): Promise<{ id: string; pairingUrl: string }> {
  const token = randomBytes(32).toString("base64url");
  const device = await db.kioskDevice.create({
    data: { label: input.label.trim(), tokenHash: hashToken(token), pairedById: input.actorId },
    select: { id: true },
  });
  await db.auditLog.create({
    data: { actorId: input.actorId, action: "kiosk.device_add", entityType: "kiosk_device", entityId: device.id, after: { label: input.label.trim() } },
  });
  const site = serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return { id: device.id, pairingUrl: `${site}/kiosk/pair?token=${encodeURIComponent(token)}` };
}

export async function listKioskDevices(db: Db): Promise<KioskDeviceRow[]> {
  const rows = await db.kioskDevice.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, lastSeenAt: true, revokedAt: true, createdAt: true, pairedBy: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, paired: r.lastSeenAt !== null }));
}

/** Stops that screen selling. The cookie stays on it but no longer resolves to a device. */
export async function revokeKioskDevice(db: Db, input: { deviceId: string; actorId: string }): Promise<void> {
  await db.kioskDevice.update({ where: { id: input.deviceId }, data: { revokedAt: new Date() } });
  await db.auditLog.create({
    data: { actorId: input.actorId, action: "kiosk.device_revoke", entityType: "kiosk_device", entityId: input.deviceId, after: {} },
  });
}

/**
 * Turns a pairing token into the cookie the screen keeps. The link pairs one screen, once, within
 * `PAIRING_VALID_MINUTES`: a link left in a chat can neither pair a screen later nor pair a second one.
 * A screen that loses its cookie needs a fresh link.
 */
export async function pairKioskDevice(db: Db, token: string, now = new Date()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return false;
  const device = await db.kioskDevice.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, revokedAt: true, createdAt: true, lastSeenAt: true },
  });
  if (!device || device.revokedAt || device.lastSeenAt) return false;
  if (now.getTime() - device.createdAt.getTime() > PAIRING_VALID_MINUTES * 60_000) return false;

  await db.kioskDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } });
  const store = await cookies();
  store.set(KIOSK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return true;
}

/** The paired screen this request comes from, or null. Every kiosk sale checks this on the server. */
export async function currentKioskDevice(db: Db, now = new Date()): Promise<{ id: string; label: string } | null> {
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const device = await db.kioskDevice.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, label: true, revokedAt: true, lastSeenAt: true },
  });
  if (!device || device.revokedAt) return null;

  if (!device.lastSeenAt || now.getTime() - device.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db.kioskDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } });
  }
  return { id: device.id, label: device.label };
}
