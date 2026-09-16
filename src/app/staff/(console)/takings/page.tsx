import Link from "next/link";
import { formatRupees } from "@/lib/format";
import { addDays, shortDate } from "@/lib/venue-time";
import { isLocalDate, utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";
import { getTakings } from "@/server/staff/takings";
import styles from "@/components/staff/Takings.module.css";

const METHOD_LABEL: Record<string, string> = {
  RAZORPAY: "Online (Razorpay)",
  CASH: "Cash",
  UPI_COUNTER: "UPI at desk",
  CARD_COUNTER: "Card at desk",
  COMPLIMENTARY: "Complimentary",
};

export default async function TakingsPage(props: PageProps<"/staff/takings">) {
  const params = await props.searchParams;
  const settings = await loadSettings(db);
  const today = utcToLocal(new Date(), settings.venue.timezone).date;
  const date = typeof params.date === "string" && isLocalDate(params.date) ? params.date : today;
  const takings = await getTakings(db, date);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <span className="tel tel-o">End of shift</span>
          <h1>Takings</h1>
          <p className={styles.sub}>
            {date === today ? "Today" : shortDate(date).label} · {takings.sessions.sold} seats sold · {takings.sessions.checkedIn} checked in ·{" "}
            {takings.sessions.noShows} no-shows
          </p>
        </div>
        <div className={styles.dates}>
          <Link className="btn btn-ghost btn-sm" href={`/staff/takings?date=${addDays(date, -1)}`}>
            ‹
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/staff/takings">
            Today
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/staff/takings?date=${addDays(date, 1)}`}>
            ›
          </Link>
        </div>
      </header>

      <section className={styles.cashCard}>
        <span className="tel">Cash that should be in the drawer</span>
        <strong>{formatRupees(takings.cashInDrawerPaise)}</strong>
        <small>Cash taken today, minus cash refunds handed back today. Count the drawer against this before closing.</small>
      </section>

      <section className={styles.card}>
        <span className="tel">By payment method</span>
        {takings.lines.length === 0 ? (
          <p className={styles.muted}>No money moved on this date.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Method</th>
                <th>Payments</th>
                <th>Taken</th>
                <th>Refunded</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {takings.lines.map((line) => (
                <tr key={line.method}>
                  <td>{METHOD_LABEL[line.method] ?? line.method}</td>
                  <td>{line.payments}</td>
                  <td>{formatRupees(line.collectedPaise)}</td>
                  <td>{line.refundedPaise > 0 ? `−${formatRupees(line.refundedPaise)}` : "—"}</td>
                  <td>
                    <b>{formatRupees(line.netPaise)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>All methods</td>
                <td>{takings.totals.payments}</td>
                <td>{formatRupees(takings.totals.collectedPaise)}</td>
                <td>{takings.totals.refundedPaise > 0 ? `−${formatRupees(takings.totals.refundedPaise)}` : "—"}</td>
                <td>
                  <b>{formatRupees(takings.totals.netPaise)}</b>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className={styles.muted}>
          At the desk: {formatRupees(takings.counter.netPaise)} · Online: {formatRupees(takings.totals.netPaise - takings.counter.netPaise)}
        </p>
      </section>

      {takings.pendingDeskRefunds.length > 0 && (
        <section className={styles.card}>
          <span className="tel tel-o">Refunds still to hand back</span>
          <ul className={styles.pending}>
            {takings.pendingDeskRefunds.map((refund) => (
              <li key={refund.id}>
                <b>{formatRupees(refund.amountPaise)}</b>
                <span>
                  {refund.reference} · paid by {METHOD_LABEL[refund.method] ?? refund.method}
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.muted}>Open the booking to mark a refund as handed over. These are not deducted from the drawer figure until then.</p>
        </section>
      )}
    </div>
  );
}
