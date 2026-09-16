import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, plural } from "@/components/legal/LegalPage";
import styles from "@/components/legal/Legal.module.css";
import { getPolicyFacts } from "@/server/site/policies";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Cancellation and refund policy",
  description: "When you can cancel or move a Motion RS4V booking, how much is refunded, and how long refunds take.",
};

export default async function RefundsPage() {
  const f = await getPolicyFacts();
  const { venue, policy } = f;
  const free = plural(policy.freeCancelHours, "hour");

  const sections = [
    {
      id: "summary",
      title: "At a glance",
      body: (
        <>
          <div className={styles.callout}>
            <b>Cancel up to {free} before your session for a full refund.</b>
            <span>After that, or once the session has started, there&apos;s no refund.</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">What happens</th>
                  <th scope="col">Refund</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>You cancel {free} or more before the session</td>
                  <td>Full refund of what you paid</td>
                </tr>
                <tr>
                  <td>You cancel less than {free} before the session</td>
                  <td>No refund</td>
                </tr>
                <tr>
                  <td>The session has already started</td>
                  <td>Can&apos;t be cancelled, no refund</td>
                </tr>
                <tr>
                  <td>You don&apos;t arrive (no-show)</td>
                  <td>No refund</td>
                </tr>
                <tr>
                  <td>We cancel the session</td>
                  <td>Full refund, whenever it happens</td>
                </tr>
                <tr>
                  <td>Your payment arrives after the seats were taken</td>
                  <td>Full refund, automatically</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ),
    },
    {
      id: "cancel",
      title: "Cancelling a booking",
      body: (
        <>
          <ul>
            <li>
              Open the link in your confirmation email and choose <strong>Cancel</strong>. If you can&apos;t find the email, use{" "}
              <Link href="/find-booking">Find My Booking</Link>, or contact us.
            </li>
            <li>
              You can cancel the whole booking or just some drivers. When you cancel some drivers inside the free window, you get back their share of what you
              paid; the rest of the booking stays as it is.
            </li>
            <li>The cancellation window is measured from the start time of your session, not from when you booked.</li>
            <li>The rules that apply are the ones shown when you booked, even if we change them later.</li>
          </ul>
        </>
      ),
    },
    {
      id: "move",
      title: "Moving instead of cancelling",
      body: (
        <p>
          {policy.maxReschedules > 0 ? (
            <>
              Can&apos;t make it? You can move your booking to another available session {policy.maxReschedules === 1 ? "once" : `up to ${policy.maxReschedules} times`}
              , up to {plural(policy.rescheduleCutoffMinutes, "minute")} before it starts, at no charge. The price you paid stays the same.
            </>
          ) : (
            <>Bookings can&apos;t be moved online, but contact us and we&apos;ll help if a session is available.</>
          )}
        </p>
      ),
    },
    {
      id: "no-shows",
      title: "Late arrivals and no-shows",
      body: (
        <p>
          If a driver hasn&apos;t checked in {plural(policy.noShowGraceMinutes, "minute")} after the session starts, their seat may be given to a walk-in customer
          and isn&apos;t refunded. Arriving late but within that time shortens your drive; it doesn&apos;t extend the session or give a partial refund.
        </p>
      ),
    },
    {
      id: "venue-cancels",
      title: "If we cancel",
      body: (
        <p>
          If we can&apos;t run your session (a technical fault, maintenance, a power cut or anything else on our side), you get a <strong>full refund</strong>{" "}
          however close to the session it is, or you can move to another session instead. We&apos;ll contact you using the details on your booking.
        </p>
      ),
    },
    {
      id: "how",
      title: "How refunds are paid",
      body: (
        <ul>
          <li>
            <strong>Paid online:</strong> refunded to the same card, UPI account or bank you paid with, through Razorpay. We start the refund straight away;
            banks usually take <strong>5–7 working days</strong> to show it.
          </li>
          <li>
            <strong>Paid at the desk</strong> (cash, UPI or card at the venue): refunded at the desk. Please bring your booking reference.
          </li>
          <li>We don&apos;t charge a fee for cancelling within the free window.</li>
          <li>Refunds can&apos;t be paid to a different person, card or account.</li>
        </ul>
      ),
    },
  ];

  return (
    <LegalPage
      current="/refunds"
      eyebrow="Cancellation & refunds"
      title="Cancellation and refunds."
      intro={<p>Plans change. Here&apos;s exactly what you get back, and when, if you need to cancel or move a booking at {venue.name}.</p>}
      sections={sections}
      venue={venue}
      operator={f.operator}
    />
  );
}
