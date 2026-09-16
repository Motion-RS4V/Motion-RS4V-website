"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatRupees } from "@/lib/format";
import { addDays, shortDate } from "@/lib/venue-time";
import type { Board, BoardBooking } from "@/server/staff/board";
import styles from "./Board.module.css";

const REFRESH_MS = 20_000;

const SEAT_TONE: Record<string, string> = { BOOKED: "wait", CHECKED_IN: "in", COMPLETED: "done", NO_SHOW: "miss", CANCELLED: "gone" };

function BookingRow({ booking }: { booking: BoardBooking }) {
  const waiting = booking.seats.filter((s) => s.status === "BOOKED").length;
  return (
    <Link href={`/staff/booking/${booking.id}`} className={styles.booking} data-status={booking.status}>
      <span className={styles.bookingTop}>
        <span className={styles.name}>{booking.customerName}</span>
        <span className={styles.ref}>{booking.reference}</span>
      </span>
      <span className={styles.seats}>
        {booking.seats.map((seat) => (
          <span key={seat.id} className={styles.seat} data-tone={SEAT_TONE[seat.status] ?? "wait"}>
            {seat.driverName || seat.experience}
            <small>
              {seat.car ? `${seat.car} · ${seat.rig}` : seat.experience}
            </small>
          </span>
        ))}
      </span>
      <span className={styles.bookingFoot}>
        {booking.channel === "WALK_IN" ? "Walk-in" : booking.channel === "PHONE" ? "Phone" : "Online"}
        {booking.duePaise > 0 ? ` · ${formatRupees(booking.duePaise)} due` : " · paid"}
        {waiting > 0 ? ` · ${waiting} to check in` : ""}
      </span>
    </Link>
  );
}

export function BoardView({ board, today }: { board: Board; today: string }) {
  const router = useRouter();
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, router]);

  const label = shortDate(board.date);
  const visible = board.slots.filter((s) => s.state !== "past" || s.sold > 0);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <span className="tel tel-o">Today at the venue</span>
          <h1>
            {board.date === today ? "Today" : label.label}
            <small>
              {board.hours ? `${board.hours.opensAt} – ${board.hours.closesAt}` : "Closed"}
              {board.nowLocalTime && ` · now ${board.nowLocalTime}`}
            </small>
          </h1>
        </div>
        <div className={styles.headRight}>
          <span className={styles.totals}>
            <b>{board.totals.sold}</b> sold · <b>{board.totals.checkedIn}</b> checked in
          </span>
          <div className={styles.dates}>
            <Link className="btn btn-ghost btn-sm" href={`/staff?date=${addDays(board.date, -1)}`}>
              ‹
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/staff">
              Today
            </Link>
            <Link className="btn btn-ghost btn-sm" href={`/staff?date=${addDays(board.date, 1)}`}>
              ›
            </Link>
          </div>
          <label className={styles.liveToggle}>
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Auto-refresh
          </label>
        </div>
      </header>

      {visible.length === 0 && <p className={styles.empty}>No sessions {board.hours ? "left today" : "— the venue is closed on this date"}.</p>}

      <div className={styles.slots}>
        {visible.map((slot) => (
          <section key={slot.start} className={styles.slot} data-state={slot.state}>
            <header className={styles.slotHead}>
              <span className={styles.time}>{slot.localTime}</span>
              <span className={styles.count} data-full={slot.sold >= slot.capacity ? "true" : "false"}>
                {slot.sold}/{slot.capacity}
              </span>
              {slot.state === "live" && <span className={styles.badgeLive}>Running</span>}
              {slot.state === "next" && <span className={styles.badgeNext}>Next</span>}
              {slot.blocked && <span className={styles.badgeBlocked}>Blocked</span>}
              {slot.sold < slot.capacity && slot.state !== "past" && (
                <Link className={styles.sell} href={`/staff/sell?start=${encodeURIComponent(slot.start)}`}>
                  Sell seat
                </Link>
              )}
            </header>
            {slot.blockReasons.map((r) => (
              <p key={r} className={styles.blockNote}>
                {r}
              </p>
            ))}
            <div className={styles.bookings}>
              {slot.bookings.length === 0 ? (
                <p className={styles.free}>{slot.capacity === 0 ? "No seats available" : `${slot.capacity} seats free`}</p>
              ) : (
                slot.bookings.map((b) => <BookingRow key={b.id} booking={b} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
