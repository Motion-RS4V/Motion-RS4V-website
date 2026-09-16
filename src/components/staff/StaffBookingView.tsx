"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SessionPicker } from "@/components/site/SessionPicker";
import { formatRupees } from "@/lib/format";
import type { PublicSlot } from "@/lib/public-types";
import { whatsappUrl } from "@/lib/links";
import { shortDate } from "@/lib/venue-time";
import type { StaffBooking } from "@/server/staff/board";
import styles from "./StaffBooking.module.css";

type Message = { tone: "ok" | "error"; text: string } | null;

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
  PENDING_PAYMENT: "Awaiting payment",
  EXPIRED: "Not completed",
};

const METHOD_LABEL: Record<string, string> = {
  RAZORPAY: "Online (Razorpay)",
  CASH: "Cash",
  UPI_COUNTER: "UPI at desk",
  CARD_COUNTER: "Card at desk",
  COMPLIMENTARY: "Complimentary",
};

type Quote = { allowed: boolean; refundPaise: number; reason: string } | null;

function quoteText(quote: Quote, freeCancelHours: number): string {
  if (!quote) return "no refund";
  if (!quote.allowed) {
    if (quote.reason === "SLOT_STARTED") return "the session has started, so no refund";
    if (quote.reason === "NOT_CANCELLABLE") return "this booking can no longer be cancelled";
    return "no refund";
  }
  if (quote.refundPaise > 0) return `refund ${formatRupees(quote.refundPaise)}`;
  return quote.reason === "UNPAID" ? "nothing was paid" : `no refund (under ${freeCancelHours} hours to go)`;
}

export function StaffBookingView({ booking }: { booking: StaffBooking }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirm, setConfirm] = useState<"cancel" | "no-show" | null>(null);
  const [cause, setCause] = useState<"CUSTOMER" | "VENUE">("CUSTOMER");
  const [editingSeat, setEditingSeat] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [newSlot, setNewSlot] = useState<{ slot: PublicSlot; date: string } | null>(null);

  const waiting = booking.seats.filter((s) => s.status === "BOOKED");
  const seatCounts: Record<string, number> = {};
  for (const seat of booking.seats) {
    if (seat.status === "BOOKED" || seat.status === "CHECKED_IN") seatCounts[seat.experience.code] = (seatCounts[seat.experience.code] ?? 0) + 1;
  }
  const active = booking.seats.filter((s) => s.status !== "CANCELLED");

  async function post(action: string, body: Record<string, unknown>, success: string) {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/staff/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      setMessage({ tone: "ok", text: typeof data.message === "string" ? data.message : success });
      setConfirm(null);
      setEditingSeat(null);
      router.refresh();
      return data;
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "That didn't work." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.headRow}>
        <Link href="/staff" className={styles.back}>
          ‹ Board
        </Link>
        <span className={styles.status} data-status={booking.status}>
          {STATUS_LABEL[booking.status] ?? booking.status}
        </span>
      </div>

      <header className={styles.head}>
        <div>
          <span className="tel">Booking</span>
          <h1>{booking.reference}</h1>
          <p className={styles.when}>
            {booking.dateLabel} · {booking.timeLabel}
          </p>
        </div>
        <div className={styles.customer}>
          <span className={styles.name}>{booking.customer.name}</span>
          <span className={styles.contactRow}>
            <a href={`tel:${booking.customer.phone}`}>{booking.customer.phone}</a>
            {whatsappUrl(booking.customer.phone) && (
              <a className={styles.whatsapp} href={whatsappUrl(booking.customer.phone)!} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            )}
          </span>
          {booking.contactEmail && <span className={styles.email}>{booking.contactEmail}</span>}
          <span className="tel">
            {booking.channel === "WALK_IN" ? "Walk-in" : booking.channel === "PHONE" ? "Phone booking" : "Booked online"}
            {booking.createdBy ? ` · by ${booking.createdBy.name}` : ""}
          </span>
        </div>
      </header>

      {message && (
        <p className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className="tel">Drivers</span>
          {waiting.length > 0 && booking.status !== "CANCELLED" && (
            <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null} onClick={() => void post("check-in", { bookingId: booking.id }, "Checked in. Rigs and cars assigned.")}>
              {busy === "check-in" ? "Checking in…" : `Check in ${waiting.length === active.length ? "all" : `${waiting.length}`}`}
            </button>
          )}
        </div>

        <ul className={styles.seats}>
          {active.map((seat, i) => (
            <li key={seat.id} className={styles.seat} data-status={seat.status}>
              <div className={styles.seatMain}>
                <span className={styles.driver}>{seat.driverName || `Driver ${i + 1}`}</span>
                <span className="tel">
                  {seat.experience.name} · {seat.experience.trackLabel}
                </span>
              </div>
              <div className={styles.seatAssign}>
                {seat.status === "CHECKED_IN" || seat.status === "COMPLETED" ? (
                  <span className={styles.assigned}>
                    {seat.car?.label ?? "No car"} · {seat.rig?.label ?? "No rig"}
                  </span>
                ) : (
                  <span className={styles.pending}>{seat.status === "NO_SHOW" ? "No-show" : "Waiting"}</span>
                )}
                {(seat.status === "CHECKED_IN" || seat.status === "BOOKED") && (
                  <button type="button" className={styles.change} onClick={() => setEditingSeat(editingSeat === seat.id ? null : seat.id)}>
                    {editingSeat === seat.id ? "Close" : "Change"}
                  </button>
                )}
              </div>

              {editingSeat === seat.id && (
                <div className={styles.editor}>
                  <label>
                    <span className="tel">Rig</span>
                    <select
                      defaultValue={seat.rig?.id ?? ""}
                      onChange={(e) => void post("reassign", { seatId: seat.id, rigId: e.target.value || null }, "Rig changed.")}
                      disabled={busy !== null}
                    >
                      <option value="">None</option>
                      {booking.rigs.map((r) => (
                        <option key={r.id} value={r.id} disabled={r.status !== "ACTIVE"}>
                          {r.label}
                          {r.status !== "ACTIVE" ? " (under repair)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="tel">Car</span>
                    <select
                      defaultValue={seat.car?.id ?? ""}
                      onChange={(e) => void post("reassign", { seatId: seat.id, carId: e.target.value || null }, "Car changed.")}
                      disabled={busy !== null}
                    >
                      <option value="">None</option>
                      {booking.cars
                        .filter((c) => c.experience.code === seat.experience.code)
                        .map((c) => (
                          <option key={c.id} value={c.id} disabled={c.status !== "READY"}>
                            {c.label}
                            {c.status !== "READY" ? " (under repair)" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {booking.outstandingRefunds.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className="tel tel-o">Refund to hand back</span>
          </div>
          <ul className={styles.seats}>
            {booking.outstandingRefunds.map((refund) => (
              <li key={refund.id} className={styles.refundRow}>
                <span className={styles.seatMain}>
                  <b>{formatRupees(refund.amountPaise)}</b>
                  <small>
                    {refund.kind === "COUNTER"
                      ? `Paid by ${METHOD_LABEL[refund.method] ?? refund.method.toLowerCase()} — give it back at the desk`
                      : "Online refund failed at Razorpay — try again"}
                  </small>
                </span>
                {refund.kind === "COUNTER" ? (
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void post("refund-paid", { refundId: refund.id }, "Marked as refunded.")}
                  >
                    {busy === "refund-paid" ? "Saving…" : "Mark as refunded"}
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void post("refund-retry", { refundId: refund.id }, "Refund sent again.")}
                  >
                    {busy === "refund-retry" ? "Retrying…" : "Retry refund"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className="tel">Payment</span>
          <span className={styles.total}>
            {formatRupees(booking.paidPaise - booking.refundedPaise)} paid
            {booking.duePaise > 0 && <b> · {formatRupees(booking.duePaise)} due at desk</b>}
          </span>
        </div>
        <ul className={styles.payments}>
          {booking.payments.length === 0 && <li className={styles.pending}>No payment recorded.</li>}
          {booking.payments.map((p) => (
            <li key={p.id}>
              <span>{METHOD_LABEL[p.method] ?? p.method}</span>
              <span>{formatRupees(p.amountPaise)}</span>
              <span className="tel">{p.status.toLowerCase().replace("_", " ")}</span>
            </li>
          ))}
          {booking.refundedPaise > 0 && (
            <li className={styles.refund}>
              <span>Refunded</span>
              <span>−{formatRupees(booking.refundedPaise)}</span>
              <span />
            </li>
          )}
        </ul>
      </section>

      {booking.status === "CONFIRMED" && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className="tel">Move to another session</span>
            {!moving && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setMoving(true)}>
                Move booking
              </button>
            )}
          </div>
          {moving && (
            <>
              <p className={styles.muted}>
                Moves every driver to the new time, keeping what they paid. Useful when someone arrives late or wants a different session.
              </p>
              <SessionPicker
                timezone={booking.venue.timezone}
                bookingWindowDays={booking.venue.bookingWindowDays}
                slotMinutes={booking.venue.slotMinutes}
                basePricePaise={booking.unitPricePaise}
                counts={seatCounts}
                selectedStart={newSlot?.slot.start ?? null}
                onSelect={(slot, date) => setNewSlot({ slot, date })}
                onDateChange={() => setNewSlot(null)}
                currentStart={booking.slotStartIso}
              />
              <div className={styles.rowButtons}>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  disabled={!newSlot || busy !== null}
                  onClick={() =>
                    void post("move", { bookingId: booking.id, start: newSlot!.slot.start }, `Moved to ${shortDate(newSlot!.date).label}, ${newSlot!.slot.time}.`).then(
                      () => {
                        setMoving(false);
                        setNewSlot(null);
                      },
                    )
                  }
                >
                  {busy === "move" ? "Moving…" : newSlot ? `Move to ${shortDate(newSlot.date).label}, ${newSlot.slot.time}` : "Pick a new time"}
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setMoving(false); setNewSlot(null); }}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {(booking.status === "CONFIRMED" || booking.status === "CHECKED_IN") && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className="tel">Problems</span>
          </div>
          {confirm === null && (
            <div className={styles.rowButtons}>
              {waiting.length > 0 && (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirm("no-show")}>
                  Mark no-show
                </button>
              )}
              {/* Once anyone is checked in the session is under way: cancelling is no longer possible. */}
              {booking.status === "CONFIRMED" ? (
                <button className={`btn btn-ghost btn-sm ${styles.danger}`} type="button" onClick={() => setConfirm("cancel")}>
                  Cancel booking
                </button>
              ) : (
                <p className={styles.pending}>
                  {waiting.length > 0
                    ? "Some drivers are checked in, so this booking can no longer be cancelled. Mark anyone who didn't turn up as a no-show."
                    : "Everyone is checked in, so this booking can no longer be cancelled. If something goes wrong during the session, the owner can refund it."}
                </p>
              )}
            </div>
          )}
          {confirm === "no-show" && (
            <div className={styles.confirm} role="alertdialog" aria-label="Confirm no-show">
              <strong>Mark {waiting.length === active.length ? "this booking" : `${waiting.length} drivers`} as a no-show?</strong>
              <p>Their seats are released for walk-ins straight away. There&apos;s no refund for a no-show.</p>
              <div className={styles.rowButtons}>
                <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null} onClick={() => void post("no-show", { bookingId: booking.id }, "Marked as a no-show.")}>
                  {busy === "no-show" ? "Marking…" : "Yes, mark no-show"}
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirm(null)}>
                  Back
                </button>
              </div>
            </div>
          )}
          {confirm === "cancel" && (
            <div className={styles.confirm} role="alertdialog" aria-label="Confirm cancellation">
              <strong>Why is this being cancelled?</strong>
              <div className={styles.causes}>
                <label className={styles.cause} data-on={cause === "CUSTOMER" ? "true" : "false"}>
                  <input type="radio" name="cause" checked={cause === "CUSTOMER"} onChange={() => setCause("CUSTOMER")} />
                  <span>
                    <b>The customer asked</b>
                    <small>
                      Normal policy: {quoteText(booking.cancelQuotes.customer, booking.freeCancelHours)}
                    </small>
                  </span>
                </label>
                <label className={styles.cause} data-on={cause === "VENUE" ? "true" : "false"}>
                  <input type="radio" name="cause" checked={cause === "VENUE"} onChange={() => setCause("VENUE")} />
                  <span>
                    <b>We can&apos;t run the session</b>
                    <small>Car or rig problem, power cut, staff shortage: {quoteText(booking.cancelQuotes.venue, booking.freeCancelHours)}</small>
                  </span>
                </label>
              </div>
              <p>Online payments are refunded automatically and take 5–7 working days. Counter payments are refunded in cash at the desk.</p>
              <div className={styles.rowButtons}>
                <button
                  className={`btn btn-sm ${styles.dangerSolid}`}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void post("cancel", { bookingId: booking.id, cause }, "Booking cancelled.")}
                >
                  {busy === "cancel" ? "Cancelling…" : cause === "VENUE" ? "Cancel and refund in full" : "Yes, cancel booking"}
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirm(null)}>
                  Keep booking
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
