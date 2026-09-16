"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SessionPicker } from "@/components/site/SessionPicker";
import { formatRupees } from "@/lib/format";
import type { PublicSlot } from "@/lib/public-types";
import { shortDate } from "@/lib/venue-time";
import styles from "./Manage.module.css";

type Seat = { id: string; label: string; experience: string; experienceCode: string; status: string };
type Preview = { allowed: boolean; refundPaise: number; reason: string };

type Props = {
  token: string;
  status: string;
  seats: Seat[];
  slotStart: string;
  cancel: Preview & { seatsToCancel: number; activeSeats: number };
  reschedule: { allowed: boolean; reason: string | null };
  policy: { freeCancelHours: number; rescheduleCutoffMinutes: number; maxReschedules: number };
  currentLabel: string;
  venue: { timezone: string; bookingWindowDays: number; slotMinutes: number };
  unitPricePaise: number;
};

function refundSentence(p: Preview, hours: number) {
  if (!p.allowed) {
    if (p.reason === "SLOT_STARTED") return "The session has started, so it can no longer be cancelled.";
    return "This booking can't be cancelled online. Please ask at the desk.";
  }
  if (p.reason === "FREE_WINDOW") return `You'll get ${formatRupees(p.refundPaise)} back to your original payment method (usually 5–7 working days).`;
  if (p.reason === "LATE_NO_REFUND") return `No refund: it's less than ${hours} hours before your session.`;
  return "There's nothing to refund.";
}

function rescheduleSentence(reason: string | null, policy: Props["policy"]) {
  switch (reason) {
    case "TOO_LATE":
      return `Moves close ${policy.rescheduleCutoffMinutes} minutes before the session.`;
    case "LIMIT_REACHED":
      return `This booking has already been moved ${policy.maxReschedules === 1 ? "once" : `${policy.maxReschedules} times`}. Ask at the desk if you need another change.`;
    case "SLOT_STARTED":
      return "The session has started.";
    default:
      return "This booking can't be moved online.";
  }
}

export function ManageActions(props: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<"none" | "cancel" | "move">("none");
  const [chosen, setChosen] = useState<string[]>(() => props.seats.filter((s) => s.status === "BOOKED").map((s) => s.id));
  const [preview, setPreview] = useState<{ key: string; value: Preview } | null>(null);
  const [newSlot, setNewSlot] = useState<{ slot: PublicSlot; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmingMove, setConfirmingMove] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const cancellable = props.seats.filter((s) => s.status === "BOOKED");
  const allChosen = chosen.length === cancellable.length;
  const previewKey = chosen.slice().sort().join(",");
  const shownPreview = allChosen ? props.cancel : preview?.key === previewKey ? preview.value : null;

  useEffect(() => {
    if (panel !== "cancel" || allChosen || chosen.length === 0) return;
    const controller = new AbortController();
    fetch(`/api/manage/${props.token}/cancel?seats=${previewKey}`, { cache: "no-store", signal: controller.signal })
      .then((r) => r.json())
      .then((value: Preview) => setPreview({ key: previewKey, value }))
      .catch(() => {});
    return () => controller.abort();
  }, [panel, allChosen, chosen.length, previewKey, props.token]);

  const counts: Record<string, number> = {};
  for (const s of cancellable) counts[s.experienceCode] = (counts[s.experienceCode] ?? 0) + 1;

  if (props.status !== "CONFIRMED") {
    return (
      <aside className={styles.actions}>
        <span className="tel">Changes</span>
        <p className={styles.muted}>
          {props.status === "CHECKED_IN" && "You're checked in. Enjoy the drive."}
          {props.status === "COMPLETED" && "This session is complete. Thanks for driving with us."}
          {props.status === "CANCELLED" && "This booking has been cancelled. Any refund due is on its way to your original payment method."}
          {!["CHECKED_IN", "COMPLETED", "CANCELLED"].includes(props.status) && "This booking can't be changed online."}
        </p>
        <Link className="btn btn-ghost btn-sm" href="/#book">
          Book another session <span className="arr">→</span>
        </Link>
      </aside>
    );
  }

  async function submitCancel() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/manage/${props.token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allChosen ? {} : { seatIds: chosen }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The cancellation didn't go through.");
      const refund = body.refundedPaise > 0 ? ` ${formatRupees(body.refundedPaise)} is being refunded to your original payment method.` : "";
      const desk = body.counterDuePaise > 0 ? ` ${formatRupees(body.counterDuePaise)} is waiting for you at the desk, as this booking was paid there.` : "";
      const failed = body.refundFailedPaise > 0 ? " The refund couldn't be started automatically; our team will process it." : "";
      setMessage({
        tone: "ok",
        text: `${body.bookingStatus === "CANCELLED" ? "Booking cancelled." : "Drivers removed."}${refund}${desk}${failed} A confirmation email is on its way.`,
      });
      setConfirming(false);
      setPanel("none");
      router.refresh();
    } catch (e) {
      setConfirming(false);
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "The cancellation didn't go through." });
    } finally {
      setBusy(false);
    }
  }

  async function submitMove() {
    if (!newSlot) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/manage/${props.token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: newSlot.slot.start }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The booking couldn't be moved.");
      setMessage({ tone: "ok", text: `Moved to ${shortDate(newSlot.date).label}, ${newSlot.slot.time}. A confirmation email is on its way.` });
      setConfirmingMove(false);
      setPanel("none");
      setNewSlot(null);
      router.refresh();
    } catch (e) {
      setConfirmingMove(false);
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "The booking couldn't be moved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={styles.actions} aria-label="Change your booking">
      <span className="tel">Changes</span>

      {message && (
        <p className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      <div className={styles.buttons}>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          aria-expanded={panel === "move"}
          onClick={() => {
            setConfirmingMove(false);
            setPanel(panel === "move" ? "none" : "move");
          }}
        >
          Move to another time
        </button>
        <button className="btn btn-ghost btn-sm" type="button" aria-expanded={panel === "cancel"} onClick={() => {
            setConfirming(false);
            setPanel(panel === "cancel" ? "none" : "cancel");
          }}>
          Cancel
        </button>
      </div>

      {panel === "move" && (
        <div className={styles.panel}>
          {!props.reschedule.allowed ? (
            <p className={styles.muted}>{rescheduleSentence(props.reschedule.reason, props.policy)}</p>
          ) : (
            <>
              <p className={styles.muted}>
                Choose a new time for all {cancellable.length === 1 ? "your driver" : `${cancellable.length} drivers`}. You can move a booking{" "}
                {props.policy.maxReschedules === 1 ? "once" : `${props.policy.maxReschedules} times`}, and the price you paid stays the same.
              </p>
              <SessionPicker
                timezone={props.venue.timezone}
                bookingWindowDays={props.venue.bookingWindowDays}
                slotMinutes={props.venue.slotMinutes}
                basePricePaise={props.unitPricePaise}
                counts={counts}
                selectedStart={newSlot?.slot.start ?? null}
                onSelect={(slot, date) => {
                  setConfirmingMove(false);
                  setNewSlot({ slot, date });
                }}
                onDateChange={() => {
                  setConfirmingMove(false);
                  setNewSlot(null);
                }}
                currentStart={props.slotStart}
              />
              {confirmingMove && newSlot ? (
                <div className={styles.confirm} role="alertdialog" aria-label="Confirm the new time">
                  <strong>Move this booking?</strong>
                  <p>
                    From <b>{props.currentLabel}</b> to <b>{`${shortDate(newSlot.date).label}, ${newSlot.slot.time}`}</b>.{" "}
                    {props.policy.maxReschedules === 1
                      ? "This uses your one move, so the time can't be changed again online."
                      : "Your old seats are released straight away."}
                  </p>
                  <div className={styles.confirmRow}>
                    <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void submitMove()}>
                      {busy ? "Moving…" : "Yes, move booking"}
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => setConfirmingMove(false)}>
                      Keep current time
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-primary" type="button" disabled={!newSlot} onClick={() => setConfirmingMove(true)}>
                  {newSlot ? `Move to ${shortDate(newSlot.date).label}, ${newSlot.slot.time}` : "Pick a new time"} <span className="arr">→</span>
                </button>
              )}
              {props.policy.maxReschedules === 1 && <p className={styles.small}>Bookings can only be moved once, so check the time before confirming.</p>}
            </>
          )}
        </div>
      )}

      {panel === "cancel" && (
        <div className={styles.panel}>
          {cancellable.length > 1 && (
            <fieldset className={styles.seatChoice}>
              <legend className="tel">Who&apos;s cancelling?</legend>
              {cancellable.map((s) => (
                <label key={s.id} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(s.id)}
                    onChange={(e) => {
                      setConfirming(false);
                      setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((id) => id !== s.id)));
                    }}
                  />
                  <span>
                    {s.label} <small>{s.experience}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <p className={styles.refund} aria-live="polite">
            {chosen.length === 0 ? "Choose at least one driver." : shownPreview ? refundSentence(shownPreview, props.policy.freeCancelHours) : "Working out your refund…"}
          </p>
          {confirming ? (
            <div className={styles.confirm} role="alertdialog" aria-label="Confirm cancellation">
              <strong>{allChosen ? "Cancel this booking?" : `Remove ${chosen.length === 1 ? "this driver" : `these ${chosen.length} drivers`}?`}</strong>
              <p>
                {shownPreview?.refundPaise
                  ? `${formatRupees(shownPreview.refundPaise)} goes back to your original payment method.`
                  : "No refund applies."}{" "}
                {allChosen ? "Your seats are released straight away and this can't be undone." : "Their seats are released straight away and this can't be undone."}
              </p>
              <div className={styles.confirmRow}>
                <button className={`btn btn-sm ${styles.danger}`} type="button" disabled={busy} onClick={() => void submitCancel()}>
                  {busy ? "Cancelling…" : allChosen ? "Yes, cancel booking" : "Yes, remove"}
                </button>
                <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => setConfirming(false)}>
                  Keep my booking
                </button>
              </div>
            </div>
          ) : (
            <button
              className={`btn btn-sm ${styles.danger}`}
              type="button"
              disabled={chosen.length === 0 || !shownPreview?.allowed}
              onClick={() => setConfirming(true)}
            >
              {allChosen ? "Cancel booking" : `Remove ${chosen.length === 1 ? "1 driver" : `${chosen.length} drivers`}`}
            </button>
          )}
        </div>
      )}

      <p className={styles.small}>
        Full refund up to {props.policy.freeCancelHours} hours before your session. Keep this page private: anyone with the link can change the booking.
      </p>
    </aside>
  );
}
