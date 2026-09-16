import type { PrismaClient } from "@/generated/prisma/client";
import { formatRupees } from "@/lib/format";
import { sessionLabels } from "@/server/booking";
import { sendTemplateEmail } from "@/server/email/send";
import type { EmailProvider } from "@/server/email/providers";
import { serverEnv } from "@/server/env";
import { loadSettings } from "@/server/settings";

export function manageUrl(token: string): string {
  return `${serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/manage/${token}`;
}

async function bookingForEmail(db: PrismaClient, bookingId: string) {
  return db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      slotStart: true,
      slotEnd: true,
      totalPaise: true,
      contactEmail: true,
      customer: { select: { name: true } },
      seats: { select: { status: true, experience: { select: { name: true, trackLabel: true, sortOrder: true } } } },
    },
  });
}

function driverLines(seats: { status: string; experience: { name: string; trackLabel: string; sortOrder: number } }[]) {
  const lines = new Map<string, { count: number; experience: string; track: string; order: number }>();
  for (const s of seats) {
    if (s.status === "CANCELLED") continue;
    const line = lines.get(s.experience.name) ?? { count: 0, experience: s.experience.name, track: s.experience.trackLabel, order: s.experience.sortOrder };
    line.count++;
    lines.set(s.experience.name, line);
  }
  return [...lines.values()].sort((a, b) => a.order - b.order).map(({ count, experience, track }) => ({ count, experience, track }));
}

export async function emailBookingConfirmed(db: PrismaClient, bookingId: string, token: string, provider?: EmailProvider) {
  const [b, settings] = await Promise.all([bookingForEmail(db, bookingId), loadSettings(db)]);
  return sendTemplateEmail(
    db,
    {
      template: "booking.confirmed",
      to: b.contactEmail,
      bookingId,
      data: {
        name: b.customer.name,
        reference: b.reference,
        ...sessionLabels(b.slotStart, b.slotEnd, settings.venue.timezone),
        drivers: driverLines(b.seats),
        totalLabel: formatRupees(b.totalPaise),
        manageUrl: manageUrl(token),
        arriveEarlyMinutes: settings.schedule.arriveEarlyMinutes,
        address: settings.venue.address,
        mapsUrl: settings.venue.mapsUrl,
      },
    },
    provider,
  );
}

export async function emailBookingRescheduled(db: PrismaClient, bookingId: string, token: string, provider?: EmailProvider) {
  const [b, settings] = await Promise.all([bookingForEmail(db, bookingId), loadSettings(db)]);
  return sendTemplateEmail(
    db,
    {
      template: "booking.rescheduled",
      to: b.contactEmail,
      bookingId,
      data: {
        name: b.customer.name,
        reference: b.reference,
        ...sessionLabels(b.slotStart, b.slotEnd, settings.venue.timezone),
        manageUrl: manageUrl(token),
        arriveEarlyMinutes: settings.schedule.arriveEarlyMinutes,
      },
    },
    provider,
  );
}

export async function emailBookingCancelled(
  db: PrismaClient,
  input: { bookingId: string; partial: boolean; seatsCancelled: number; refundPaise: number; deskRefundPaise?: number; token: string | null },
  provider?: EmailProvider,
) {
  const [b, settings] = await Promise.all([bookingForEmail(db, input.bookingId), loadSettings(db)]);
  return sendTemplateEmail(
    db,
    {
      template: "booking.cancelled",
      to: b.contactEmail,
      bookingId: b.id,
      data: {
        name: b.customer.name,
        reference: b.reference,
        ...sessionLabels(b.slotStart, b.slotEnd, settings.venue.timezone),
        partial: input.partial,
        seatsCancelled: input.seatsCancelled,
        refundLabel: input.refundPaise > 0 ? formatRupees(input.refundPaise) : null,
        deskRefundLabel: input.deskRefundPaise && input.deskRefundPaise > 0 ? formatRupees(input.deskRefundPaise) : null,
        manageUrl: input.token ? manageUrl(input.token) : null,
      },
    },
    provider,
  );
}

export async function emailUnavailableRefunded(db: PrismaClient, bookingId: string, refundPaise: number, provider?: EmailProvider) {
  const [b, settings] = await Promise.all([bookingForEmail(db, bookingId), loadSettings(db)]);
  return sendTemplateEmail(
    db,
    {
      template: "booking.unavailable_refunded",
      to: b.contactEmail,
      bookingId,
      data: {
        name: b.customer.name,
        reference: b.reference,
        ...sessionLabels(b.slotStart, b.slotEnd, settings.venue.timezone),
        refundLabel: formatRupees(refundPaise),
      },
    },
    provider,
  );
}
