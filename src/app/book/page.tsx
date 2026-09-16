import type { Metadata } from "next";
import { CheckoutForm } from "@/components/flow/CheckoutForm";
import { FlowHeading, FlowNotice, FlowShell } from "@/components/flow/FlowShell";
import { decodeSeats, encodeSeats, slotFits, totalSeats } from "@/lib/sessions";
import { getDayAvailability, quote, sessionLabels, utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";
import { toPublicDay } from "@/server/site/content";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

const BACK = "/#book";

export default async function BookPage(props: PageProps<"/book">) {
  const params = await props.searchParams;
  const startParam = typeof params.start === "string" ? params.start : "";
  const counts = decodeSeats(typeof params.seats === "string" ? params.seats : null);
  const start = new Date(startParam);

  const unavailable = (title: string, body: string) => (
    <FlowShell backHref={BACK} backLabel="Sessions">
      <FlowNotice eyebrow="Checkout" title={title} body={body} actionHref={BACK} actionLabel="Pick a session" />
    </FlowShell>
  );

  if (!counts || Number.isNaN(start.getTime())) {
    return unavailable("Pick a session first.", "Choose your drivers, a date and a time, then continue to checkout.");
  }

  const [settings, experiences] = await Promise.all([
    loadSettings(db),
    db.experience.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true, trackLabel: true } }),
  ]);
  const seats = totalSeats(counts);
  const byCode = new Map(experiences.map((e) => [e.code, e]));
  if (seats > settings.policy.maxSeatsPerBooking || Object.keys(counts).some((code) => !byCode.has(code))) {
    return unavailable("That booking isn't possible.", `Bookings can have up to ${settings.policy.maxSeatsPerBooking} drivers on the tracks shown on the site.`);
  }

  const tz = settings.venue.timezone;
  const day = toPublicDay(await getDayAvailability(db, utcToLocal(start, tz).date, { channel: "ONLINE" }));
  const slot = day.slots.find((s) => s.start === start.toISOString());
  if (!slot || !slot.bookable || !slotFits(slot, counts)) {
    return unavailable(
      "That session isn't available any more.",
      slot && slot.reason === "ONLINE_CLOSED"
        ? "Online booking for it has closed. Pick a later time, or ask at the desk for a walk-in seat."
        : "The seats may have just been booked. Pick another time; seat counts on the site are live.",
    );
  }

  const slotEnd = new Date(start.getTime() + settings.schedule.slotMinutes * 60_000);
  const labels = sessionLabels(start, slotEnd, tz);
  const totals = quote(settings.pricing, slot.pricePaise, seats);
  const drivers = experiences.flatMap((e) => Array.from({ length: counts[e.code] ?? 0 }, () => ({ experienceCode: e.code, experience: e.name, track: e.trackLabel })));

  return (
    <FlowShell backHref={BACK} backLabel="Sessions">
      <FlowHeading eyebrow="Checkout" title="Almost there.">
        <p>
          <b>{labels.dateLabel}</b>, <b>{labels.timeLabel}</b> · {drivers.length === 1 ? "1 driver" : `${drivers.length} drivers`}. Your seats are held
          for {settings.policy.paymentHoldMinutes} minutes once you continue to payment.
        </p>
      </FlowHeading>
      <CheckoutForm
        start={slot.start}
        dateLabel={labels.dateLabel}
        timeLabel={labels.timeLabel}
        drivers={drivers}
        unitPricePaise={totals.unitPricePaise}
        totalPaise={totals.totalPaise}
        gstPaise={totals.gstPaise}
        pricesIncludeGst={settings.pricing.pricesIncludeGst}
        holdMinutes={settings.policy.paymentHoldMinutes}
        freeCancelHours={settings.policy.freeCancelHours}
        rescheduleCutoffMinutes={settings.policy.rescheduleCutoffMinutes}
        arriveEarlyMinutes={settings.schedule.arriveEarlyMinutes}
        changeHref={`${BACK}`}
        key={`${slot.start}-${encodeSeats(counts)}`}
      />
    </FlowShell>
  );
}
