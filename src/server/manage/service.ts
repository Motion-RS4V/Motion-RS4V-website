import type { PrismaClient } from "@/generated/prisma/client";
import {
  cancelBooking,
  normalizePhone,
  previewCancellation,
  previewReschedule,
  rescheduleBooking,
  sessionLabels,
} from "@/server/booking";
import { sendTemplateEmail } from "@/server/email/send";
import type { EmailProvider } from "@/server/email/providers";
import { emailBookingCancelled, emailBookingRescheduled, manageUrl } from "@/server/payments/notifications";
import type { PaymentGateway } from "@/server/payments/razorpay";
import { refundBooking } from "@/server/payments/refunds";
import { loadSettings } from "@/server/settings";
import { createManageToken } from "./tokens";

const customer = { kind: "customer" } as const;

export type ManageView = Awaited<ReturnType<typeof getManageView>>;

/** Everything the manage page shows, computed on the server. */
export async function getManageView(db: PrismaClient, bookingId: string, now = new Date()) {
  const [booking, settings] = await Promise.all([
    db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        id: true,
        reference: true,
        status: true,
        slotStart: true,
        slotEnd: true,
        totalPaise: true,
        unitPricePaise: true,
        rescheduleCount: true,
        contactEmail: true,
        customer: { select: { name: true } },
        seats: {
          orderBy: [{ experience: { sortOrder: "asc" } }, { id: "asc" }],
          select: { id: true, status: true, driverName: true, experience: { select: { code: true, name: true, trackLabel: true } } },
        },
        payments: { select: { status: true, amountPaise: true, refunds: { select: { status: true, amountPaise: true } } } },
      },
    }),
    loadSettings(db),
  ]);

  const paidPaise = booking.payments
    .filter((p) => ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status))
    .reduce((sum, p) => sum + p.amountPaise, 0);
  const refundedPaise = booking.payments.flatMap((p) => p.refunds).filter((r) => r.status !== "FAILED").reduce((sum, r) => sum + r.amountPaise, 0);

  const [cancelAll, reschedule] = await Promise.all([
    previewCancellation(db, { bookingId, actor: customer, now }),
    previewReschedule(db, { bookingId, actor: customer, now }),
  ]);

  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    name: booking.customer.name,
    contactEmail: booking.contactEmail,
    slotStart: booking.slotStart.toISOString(),
    ...sessionLabels(booking.slotStart, booking.slotEnd, settings.venue.timezone),
    seats: booking.seats.map((s) => ({
      id: s.id,
      status: s.status,
      driverName: s.driverName,
      experience: s.experience.name,
      experienceCode: s.experience.code,
      track: s.experience.trackLabel,
    })),
    paidPaise,
    refundedPaise,
    unitPricePaise: booking.unitPricePaise,
    cancel: cancelAll,
    reschedule: { allowed: reschedule.allowed, reason: "reason" in reschedule ? reschedule.reason : null },
    policy: {
      freeCancelHours: settings.policy.freeCancelHours,
      rescheduleCutoffMinutes: settings.policy.rescheduleCutoffMinutes,
      maxReschedules: settings.policy.maxReschedules,
    },
    venue: {
      address: settings.venue.address,
      mapsUrl: settings.venue.mapsUrl,
      timezone: settings.venue.timezone,
      arriveEarlyMinutes: settings.schedule.arriveEarlyMinutes,
      bookingWindowDays: settings.schedule.bookingWindowDays,
      slotMinutes: settings.schedule.slotMinutes,
    },
  };
}

/** A customer cancels some or all drivers: cancel, refund what policy allows, then confirm by email. */
export async function customerCancel(
  db: PrismaClient,
  gateway: PaymentGateway,
  input: { bookingId: string; seatIds?: string[]; now?: Date },
  provider?: EmailProvider,
) {
  const result = await cancelBooking(db, { bookingId: input.bookingId, seatIds: input.seatIds, actor: customer, reason: "Cancelled by customer", now: input.now });
  const refund = result.refundDuePaise > 0
    ? await refundBooking(db, gateway, { bookingId: input.bookingId, amountPaise: result.refundDuePaise, reason: `Customer cancellation (${result.refundReason})`, actorId: null })
    : null;

  const partial = result.bookingStatus !== "CANCELLED";
  const booking = await db.booking.findUniqueOrThrow({ where: { id: input.bookingId }, select: { id: true, slotEnd: true } });
  const token = partial ? await createManageToken(db, booking) : null;
  await emailBookingCancelled(
    db,
    {
      bookingId: input.bookingId,
      partial,
      seatsCancelled: result.cancelledSeatIds.length,
      refundPaise: refund?.refundedPaise ?? 0,
      deskRefundPaise: refund?.counterDuePaise ?? 0,
      token,
    },
    provider,
  );

  return {
    bookingStatus: result.bookingStatus,
    cancelledSeats: result.cancelledSeatIds.length,
    refundDuePaise: result.refundDuePaise,
    refundedPaise: refund?.refundedPaise ?? 0,
    counterDuePaise: refund?.counterDuePaise ?? 0,
    refundFailedPaise: refund?.failedPaise ?? 0,
  };
}

export async function customerReschedule(
  db: PrismaClient,
  input: { bookingId: string; newSlotStart: Date; now?: Date },
  provider?: EmailProvider,
) {
  const moved = await rescheduleBooking(db, { bookingId: input.bookingId, newSlotStart: input.newSlotStart, actor: customer, now: input.now });
  const token = await createManageToken(db, { id: moved.id, slotEnd: moved.slotEnd });
  await emailBookingRescheduled(db, moved.id, token, provider);
  return moved;
}

/**
 * Find My Booking: emails fresh manage links for upcoming bookings matching a phone number or email.
 * Links only ever go to the email saved on each booking, never to whatever was typed in.
 * Returns how many emails were sent; callers must not reveal this to the visitor.
 */
export async function sendManageLinks(db: PrismaClient, contact: string, now = new Date(), provider?: EmailProvider): Promise<number> {
  const trimmed = contact.trim();
  const byEmail = trimmed.includes("@");
  const phone = byEmail ? null : normalizePhone(trimmed);
  if (!byEmail && !phone) return 0;

  const bookings = await db.booking.findMany({
    where: {
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      slotEnd: { gt: now },
      ...(byEmail
        ? { OR: [{ contactEmail: { equals: trimmed, mode: "insensitive" } }, { customer: { email: { equals: trimmed, mode: "insensitive" } } }] }
        : { customer: { phone: phone! } }),
    },
    orderBy: { slotStart: "asc" },
    take: 10,
    select: { id: true, reference: true, slotStart: true, slotEnd: true, contactEmail: true, customer: { select: { name: true, email: true } } },
  });
  if (bookings.length === 0) return 0;

  const settings = await loadSettings(db);
  const byAddress = new Map<string, { name: string; links: { reference: string; dateLabel: string; timeLabel: string; manageUrl: string }[] }>();
  for (const b of bookings) {
    const address = b.contactEmail ?? b.customer.email;
    if (!address) continue;
    const token = await createManageToken(db, b);
    const entry = byAddress.get(address.toLowerCase()) ?? { name: b.customer.name, links: [] };
    entry.links.push({ reference: b.reference, ...sessionLabels(b.slotStart, b.slotEnd, settings.venue.timezone), manageUrl: manageUrl(token) });
    byAddress.set(address.toLowerCase(), entry);
  }

  let sent = 0;
  for (const [address, entry] of byAddress) {
    const status = await sendTemplateEmail(db, { template: "booking.links", to: address, data: { name: entry.name, bookings: entry.links } }, provider);
    if (status === "SENT") sent++;
  }
  return sent;
}
