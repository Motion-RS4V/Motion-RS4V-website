import type { Metadata } from "next";
import QRCode from "qrcode";
import { FlowNotice, FlowShell } from "@/components/flow/FlowShell";
import { ManageActions } from "@/components/flow/ManageActions";
import styles from "@/components/flow/Manage.module.css";
import { formatRupees } from "@/lib/format";
import { db } from "@/server/db";
import { getManageView } from "@/server/manage/service";
import { resolveManageToken } from "@/server/manage/tokens";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

const STATUS: Record<string, { label: string; tone: "good" | "info" | "muted" }> = {
  CONFIRMED: { label: "Confirmed", tone: "good" },
  CHECKED_IN: { label: "Checked in", tone: "good" },
  COMPLETED: { label: "Completed", tone: "info" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
  NO_SHOW: { label: "Missed", tone: "muted" },
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "info" },
  EXPIRED: { label: "Not completed", tone: "muted" },
};

export default async function ManagePage(props: PageProps<"/manage/[token]">) {
  const { token } = await props.params;
  const { welcome } = await props.searchParams;
  const bookingId = await resolveManageToken(db, token);

  if (!bookingId) {
    return (
      <FlowShell>
        <FlowNotice
          eyebrow="Manage booking"
          title="This link has expired."
          body="Links stop working a week after the session, or if they were typed incorrectly. Enter your mobile number or email and we'll send a fresh one."
          actionHref="/find-booking"
          actionLabel="Find my booking"
        />
      </FlowShell>
    );
  }

  const view = await getManageView(db, bookingId);
  const status = STATUS[view.status] ?? { label: view.status, tone: "info" as const };
  const active = view.seats.filter((s) => s.status !== "CANCELLED");
  const live = view.status === "CONFIRMED" || view.status === "CHECKED_IN";
  const qr = live
    ? await QRCode.toString(view.reference, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0c0e", light: "#f3f0e9" } })
    : null;

  return (
    <FlowShell>
      {welcome === "1" && live && (
        <div className={styles.welcome} role="status">
          <span className="tel tel-o">Payment received</span>
          <strong>You&apos;re booked, {view.name.split(" ")[0]}.</strong>
          <span>
            {view.contactEmail ? (
              <>
                A confirmation is on its way to <b>{view.contactEmail}</b>. Bookmark this page to manage your booking later.
              </>
            ) : (
              "Bookmark this page to manage your booking later."
            )}
          </span>
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.ticket} aria-label="Booking details">
          <div className={styles.ticketHead}>
            <span className={styles.status} data-tone={status.tone}>
              {status.label}
            </span>
            <span className="tel">Booking reference</span>
            <span className={styles.reference}>{view.reference}</span>
          </div>

          <div className={styles.when}>
            <span className={styles.date}>{view.dateLabel}</span>
            <span className={styles.time}>{view.timeLabel}</span>
          </div>

          <dl className={styles.facts}>
            <div>
              <dt className="tel">Drivers</dt>
              <dd>
                {active.length === 0 && "None"}
                {active.map((s, i) => (
                  <span key={s.id} className={styles.driverLine}>
                    <b>{s.driverName || `Driver ${i + 1}`}</b>
                    <small>
                      {s.experience} · {s.track}
                    </small>
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="tel">Paid</dt>
              <dd>
                {formatRupees(view.paidPaise)}
                {view.refundedPaise > 0 && <small className={styles.refunded}>{formatRupees(view.refundedPaise)} refunded</small>}
              </dd>
            </div>
            <div>
              <dt className="tel">Where</dt>
              <dd>
                {view.venue.mapsUrl ? (
                  <a href={view.venue.mapsUrl} target="_blank" rel="noreferrer">
                    {view.venue.address}
                  </a>
                ) : (
                  view.venue.address
                )}
                <small>Arrive {view.venue.arriveEarlyMinutes} minutes early</small>
              </dd>
            </div>
          </dl>

          {qr && (
            <div className={styles.qrRow}>
              <div className={styles.qr} dangerouslySetInnerHTML={{ __html: qr }} aria-label={`QR code for booking ${view.reference}`} role="img" />
              <p>Show this QR code or your booking reference at the desk. Staff assign each driver a car for their track when you check in.</p>
            </div>
          )}
        </section>

        <ManageActions
          token={token}
          status={view.status}
          seats={active.map((s, i) => ({ id: s.id, label: s.driverName || `Driver ${i + 1}`, experience: s.experience, experienceCode: s.experienceCode, status: s.status }))}
          slotStart={view.slotStart}
          cancel={view.cancel}
          reschedule={view.reschedule}
          policy={view.policy}
          currentLabel={`${view.dateLabel}, ${view.timeLabel.split(" – ")[0]}`}
          venue={view.venue}
          unitPricePaise={view.unitPricePaise}
        />
      </div>
    </FlowShell>
  );
}
