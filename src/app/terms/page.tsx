import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, plural } from "@/components/legal/LegalPage";
import styles from "@/components/legal/Legal.module.css";
import { getPolicyFacts } from "@/server/site/policies";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Terms of booking",
  description: "The terms that apply when you book a session at Motion RS4V: booking, payment, changes, arrival, safety and liability.",
};

export default async function TermsPage() {
  const f = await getPolicyFacts();
  const { venue, schedule, pricing, policy, eligibility } = f;

  const sections = [
    {
      id: "about",
      title: "About these terms",
      body: (
        <>
          <p>
            These terms apply to every session booked at {venue.name}, {venue.address}, whether you book on this website, by phone or at the desk. By booking,
            you accept them for yourself and for every driver in your booking.
          </p>
          <p>
            The person making the booking must be 18 or older. Cancellations and refunds are covered in our{" "}
            <Link href="/refunds">cancellation and refund policy</Link>, and how we handle your details is covered in our{" "}
            <Link href="/privacy">privacy policy</Link>. Both form part of these terms.
          </p>
        </>
      ),
    },
    {
      id: "booking",
      title: "Booking a session",
      body: (
        <>
          <ul>
            <li>
              You book a <strong>track</strong> (Track / Drift or Off-road), not a particular car. Staff assign each driver a car for their track when you
              arrive.
            </li>
            <li>
              Each session slot lasts {schedule.slotMinutes} minutes, including {schedule.driveMinutes} minutes of driving. The rest is for briefing and
              changeover.
            </li>
            <li>One booking can hold up to {plural(policy.maxSeatsPerBooking, "driver")}, and a group can mix both tracks.</li>
            <li>
              Online booking opens {plural(schedule.bookingWindowDays, "day")} ahead and closes {plural(schedule.onlineCutoffMinutes, "minute")} before a
              session starts. After that, ask at the desk: walk-in seats are sold while they last.
            </li>
            <li>Seats are shared by online bookings, phone bookings and walk-ins, and are never guaranteed until your booking is confirmed.</li>
          </ul>
        </>
      ),
    },
    {
      id: "payment",
      title: "Prices and payment",
      body: (
        <>
          <ul>
            <li>
              Prices are per driver, per session, in Indian rupees, and{" "}
              {pricing.pricesIncludeGst ? `include GST at ${pricing.gstRatePercent}%` : `GST at ${pricing.gstRatePercent}% is added at checkout`}. Some days or
              times may be priced differently; the price shown when you pick a session is the price you pay.
            </li>
            <li>
              Online bookings are paid in full at checkout through Razorpay, using UPI, cards, net banking or wallets. We never see or store your full card
              number or UPI PIN.
            </li>
            <li>
              When you start checkout, your seats are held for {plural(policy.paymentHoldMinutes, "minute")}. If payment doesn&apos;t complete in that time, the
              seats are released. If your payment arrives after the seats have been taken by someone else, we refund it in full automatically.
            </li>
            <li>A booking is confirmed only when payment succeeds. You&apos;ll get a confirmation email with your booking reference and a private link to manage it.</li>
            <li>Walk-in and phone bookings may be paid at the desk by cash, UPI or card.</li>
          </ul>
        </>
      ),
    },
    {
      id: "changes",
      title: "Changing your booking",
      body: (
        <>
          <ul>
            <li>
              {policy.maxReschedules > 0 ? (
                <>
                  You can move your booking to another available session {policy.maxReschedules === 1 ? "once" : `up to ${policy.maxReschedules} times`}, up to{" "}
                  {plural(policy.rescheduleCutoffMinutes, "minute")} before it starts, using the link in your confirmation email.
                </>
              ) : (
                <>Bookings can&apos;t be moved online. Contact us and we&apos;ll help if we can.</>
              )}
            </li>
            <li>Moving a booking keeps the price you paid, even if the new session is priced differently.</li>
            <li>
              Lost your email? Use <Link href="/find-booking">Find My Booking</Link> and we&apos;ll send the link to the email address on the booking.
            </li>
            <li>Keep your booking link private: anyone who has it can change or cancel the booking.</li>
          </ul>
        </>
      ),
    },
    {
      id: "arrival",
      title: "Arriving and no-shows",
      body: (
        <>
          <ul>
            <li>Please arrive {plural(schedule.arriveEarlyMinutes, "minute")} before your session and show your booking reference or QR code at the desk.</li>
            <li>Sessions start on time. Arriving late shortens your drive, and the session still ends at its usual time.</li>
            <li>
              If a driver hasn&apos;t checked in {plural(policy.noShowGraceMinutes, "minute")} after the session starts, their seat may be released to walk-in
              customers. This counts as a no-show and isn&apos;t refunded.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "safety",
      title: "Safety and who can drive",
      body: (
        <>
          <div className={styles.callout}>
            <b>
              Drivers must be at least {eligibility.minAgeYears} years old and {eligibility.minHeightCm} cm tall.
            </b>
            <span>Staff check this at the desk before a driver is seated.</span>
          </div>
          <ul>
            <li>Follow the safety briefing and staff instructions at all times, and treat the rigs, headsets and cars with care.</li>
            <li>Tell staff before your session if you&apos;re prone to motion sickness, epilepsy or seizures, or have any condition that screens or VR headsets may affect.</li>
            <li>
              Staff may refuse or stop a session for anyone who doesn&apos;t meet the requirements, appears unwell or under the influence of alcohol or drugs, or
              drives in a way that puts people or equipment at risk. A session stopped for these reasons isn&apos;t refunded.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "venue-changes",
      title: "If we have to change or cancel",
      body: (
        <p>
          Occasionally we may need to cancel or move a session, for example for a technical fault, maintenance or a power cut. If that happens we&apos;ll contact
          you, and you can move to another session or get a <strong>full refund</strong>, whenever it happens. We aren&apos;t responsible for other costs such as
          travel or parking.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Our responsibility to you",
      body: (
        <>
          <p>
            We take reasonable care to keep the venue and equipment safe. Nothing in these terms limits our responsibility where the law doesn&apos;t allow it
            to be limited, including for death or personal injury caused by our negligence.
          </p>
          <p>
            Otherwise, if something goes wrong with a session, our responsibility is limited to the amount you paid for that booking. Please look after your
            belongings; we can&apos;t accept responsibility for items left unattended.
          </p>
          <p>
            Photos or video of the venue may be taken during sessions. If you&apos;d prefer not to appear, tell staff at the desk.
          </p>
        </>
      ),
    },
    {
      id: "law",
      title: "Changes to these terms and governing law",
      body: (
        <>
          <p>
            We may update these terms from time to time. The version on this page when you book applies to that booking. These terms are governed by the laws
            of India, and the courts of Raipur, Chhattisgarh have jurisdiction over any dispute.
          </p>
        </>
      ),
    },
  ];

  return (
    <LegalPage
      current="/terms"
      eyebrow="Terms"
      title="Terms of booking."
      intro={<p>The short version: book a track, pay online, arrive {schedule.arriveEarlyMinutes} minutes early, follow the safety briefing, and enjoy the drive.</p>}
      sections={sections}
      venue={venue}
      operator={f.operator}
    />
  );
}
