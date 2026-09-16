"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { formatRupees, plural } from "@/lib/format";
import type { PublicExperience, PublicSlot } from "@/lib/public-types";
import { addMinutesToTime, encodeSeats, slotFits, totalSeats, type SeatCounts } from "@/lib/sessions";
import { shortDate } from "@/lib/venue-time";
import styles from "./BookingWidget.module.css";
import { PICK_EXPERIENCE_EVENT } from "./PickExperienceLink";
import { SessionPicker } from "./SessionPicker";

type Props = {
  experiences: PublicExperience[];
  maxSeats: number;
  timezone: string;
  bookingWindowDays: number;
  basePricePaise: number;
  slotMinutes: number;
};

// Placeholder track art (AI track maps, cropped) until photos of the real circuits replace it.
const ART: Record<string, string> = { track: "/media/placeholder-track-drift.jpg", offroad: "/media/placeholder-track-offroad.jpg" };

export function BookingWidget({ experiences, maxSeats, timezone, bookingWindowDays, basePricePaise, slotMinutes }: Props) {
  const [counts, setCounts] = useState<SeatCounts>(() => (experiences[0] ? { [experiences[0].code]: 1 } : {}));
  const [picked, setPicked] = useState<{ slot: PublicSlot; date: string } | null>(null);
  const [date, setDate] = useState<string | null>(null);

  useEffect(() => {
    const onPick = (event: Event) => {
      const code = (event as CustomEvent<string>).detail;
      setCounts((current) => ({ [code]: Math.max(1, totalSeats(current)) }));
    };
    window.addEventListener(PICK_EXPERIENCE_EVENT, onPick);
    return () => window.removeEventListener(PICK_EXPERIENCE_EVENT, onPick);
  }, []);

  const seats = totalSeats(counts);
  // A chosen session stops counting as chosen while the group doesn't fit it.
  const slot = picked && slotFits(picked.slot, counts) ? picked.slot : null;
  const shownDate = picked?.date ?? date;

  const change = useCallback(
    (code: string, delta: number) =>
      setCounts((current) => {
        const updated = { ...current, [code]: Math.max(0, (current[code] ?? 0) + delta) };
        return totalSeats(updated) === 0 || totalSeats(updated) > maxSeats ? current : updated;
      }),
    [maxSeats],
  );

  const unitPrice = slot?.pricePaise ?? basePricePaise;
  const continueHref = slot ? `/book?start=${encodeURIComponent(slot.start)}&seats=${encodeSeats(counts)}` : undefined;

  return (
    <div className={styles.book}>
      <div>
        <div className="step-label">
          <span className="tel">
            <b className="step-n">1</b>Choose your experience
          </span>
          <span className="tel">Mix tracks in one group</span>
        </div>
        <div className={styles.xp}>
          {experiences.map((exp) => {
            const n = counts[exp.code] ?? 0;
            const left = slot ? (slot.seatsLeftByExperience[exp.code] ?? 0) : null;
            const canAdd = seats < maxSeats && (left === null || n < left);
            return (
              <div className={styles.card} data-on={n > 0 ? "true" : "false"} key={exp.code}>
                {ART[exp.code] && (
                  <span className={`media grade ${styles.cardMedia}`}>
                    <Image src={ART[exp.code]} alt="" fill sizes="(min-width: 1000px) 25vw, 100px" />
                  </span>
                )}
                <span className={styles.cardBody}>
                  <span className={styles.cardName}>{exp.name}</span>
                  <span className={styles.cardSub}>
                    {exp.trackLabel} · {exp.tagline}
                  </span>
                  <span className={styles.cardRow}>
                    <span className="tel">{left === null ? "Drivers" : left === 0 ? "None left at this time" : `${left} left at this time`}</span>
                    <span className={styles.stepper}>
                      <button type="button" onClick={() => change(exp.code, -1)} disabled={n === 0 || seats === 1} aria-label={`Remove a ${exp.name} driver`}>
                        −
                      </button>
                      <output aria-live="polite" aria-label={`${exp.name} drivers`}>
                        {n}
                      </output>
                      <button type="button" onClick={() => change(exp.code, 1)} disabled={!canAdd} aria-label={`Add a ${exp.name} driver`}>
                        +
                      </button>
                    </span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className={styles.note}>
          You&apos;re booking a track, not a specific car. Staff assign each driver a car for their track on arrival. Up to {maxSeats} drivers per booking.
        </p>

        <SessionPicker
          timezone={timezone}
          bookingWindowDays={bookingWindowDays}
          slotMinutes={slotMinutes}
          basePricePaise={basePricePaise}
          counts={counts}
          selectedStart={slot?.start ?? null}
          onSelect={(s, d) => setPicked({ slot: s, date: d })}
          onSelectedSlotChange={(s) => setPicked((current) => (current ? { ...current, slot: s } : current))}
          onDateChange={(d) => {
            setDate(d);
            setPicked(null);
          }}
          steps={[2, 3]}
        />
      </div>

      <aside className={styles.slip} aria-label="Booking summary">
        <div className={styles.slipHead}>
          <span className="tel">Your session</span>
          <span className="tel tel-o">Live availability</span>
        </div>
        <div className={styles.slipBody}>
          <div className={styles.row}>
            <span className="tel">Experience</span>
            <span className={styles.rowVal}>
              {experiences
                .filter((e) => (counts[e.code] ?? 0) > 0)
                .map((e) => (
                  <span key={e.code}>
                    {counts[e.code]} × {e.name}
                    <small>{e.trackLabel}</small>
                  </span>
                ))}
            </span>
          </div>
          <div className={styles.row}>
            <span className="tel">Date</span>
            <span className={styles.rowVal}>{shownDate ? shortDate(shownDate).label : "Today"}</span>
          </div>
          <div className={styles.row}>
            <span className="tel">Time</span>
            <span className={styles.rowVal}>{slot ? `${slot.time} – ${addMinutesToTime(slot.time, slotMinutes)}` : "Pick a time"}</span>
          </div>
          <div className={styles.row}>
            <span className="tel">Drivers</span>
            <span className={styles.rowVal}>{seats}</span>
          </div>
        </div>
        <div className={styles.total}>
          <span className="tel">Total</span>
          <span className={styles.totalNum}>{formatRupees(unitPrice * seats)}</span>
        </div>
        <div className={styles.slipFoot}>
          <a
            className="btn btn-primary"
            href={continueHref}
            aria-disabled={!continueHref}
            onClick={(e) => {
              if (!continueHref) e.preventDefault();
            }}
          >
            {slot ? "Continue" : "Pick a time to continue"} <span className="arr">→</span>
          </a>
          <p className={styles.fine}>
            {plural(seats, "driver")} × {formatRupees(unitPrice)}. Seats are held for you while you pay. Your car is assigned by staff on arrival.
          </p>
        </div>
      </aside>
    </div>
  );
}
