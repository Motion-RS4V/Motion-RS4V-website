"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { formatRupees, plural } from "@/lib/format";
import type { PublicDay, PublicExperience, PublicSlot } from "@/lib/public-types";
import { addDays, shortDate, venueNow } from "@/lib/venue-time";
import styles from "./BookingWidget.module.css";
import { PICK_EXPERIENCE_EVENT } from "./PickExperienceLink";

type Props = {
  experiences: PublicExperience[];
  maxSeats: number;
  timezone: string;
  bookingWindowDays: number;
  basePricePaise: number;
  slotMinutes: number;
};

type Counts = Record<string, number>;
type Result = { key: string } & ({ status: "error"; message: string } | { status: "ready"; day: PublicDay });
type Load = { status: "loading" } | Result;

const ART: Record<string, string> = { track: "/media/poster-car.jpg", offroad: "/media/poster-pan.jpg" };
const DAYS_SHOWN = 14;

const REASON_LABEL: Record<NonNullable<PublicSlot["reason"]>, string> = {
  PAST: "Started",
  ONLINE_CLOSED: "Walk-in only",
  OUTSIDE_WINDOW: "Not open yet",
  FULL: "Sold out",
};

function subscribeToMinute(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

function total(counts: Counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function fits(slot: PublicSlot, counts: Counts) {
  if (!slot.bookable || total(counts) > slot.seatsLeft) return false;
  return Object.entries(counts).every(([code, n]) => n <= (slot.seatsLeftByExperience[code] ?? 0));
}

function addMinutesToTime(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

const PERIODS = ["Morning", "Afternoon", "Evening"] as const;
type Period = (typeof PERIODS)[number];

function period(time: string): Period {
  const hour = Number(time.slice(0, 2));
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

export function BookingWidget({ experiences, maxSeats, timezone, bookingWindowDays, basePricePaise, slotMinutes }: Props) {
  const [counts, setCounts] = useState<Counts>(() => (experiences[0] ? { [experiences[0].code]: 1 } : {}));
  // "Today" comes from the visitor's clock in the venue's timezone. The page itself is cached, so the server renders no date.
  const today = useSyncExternalStore(subscribeToMinute, () => venueNow(timezone).date, () => null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const date = pickedDate ?? today;
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [periodChoice, setPeriodChoice] = useState<Period | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = date ? `${date}#${reloadKey}` : null;
  const load: Load = result && result.key === requestKey ? result : { status: "loading" };

  useEffect(() => {
    const onPick = (event: Event) => {
      const code = (event as CustomEvent<string>).detail;
      setCounts((current) => ({ [code]: Math.max(1, total(current)) }));
    };
    window.addEventListener(PICK_EXPERIENCE_EVENT, onPick);
    return () => window.removeEventListener(PICK_EXPERIENCE_EVENT, onPick);
  }, []);

  useEffect(() => {
    if (!date || !requestKey) return;
    const controller = new AbortController();
    fetch(`/api/availability?date=${date}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Sessions couldn't be loaded.");
        setResult({ key: requestKey, status: "ready", day: body as PublicDay });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Sessions couldn't be loaded.";
        setResult({ key: requestKey, status: "error", message });
      });
    return () => controller.abort();
  }, [date, requestKey]);

  const day = load.status === "ready" ? load.day : null;
  const seats = total(counts);
  // A chosen session stops counting as chosen while the seat mix doesn't fit it.
  const slot = day?.slots.find((s) => s.start === selected && fits(s, counts)) ?? null;

  const upcoming = day ? day.slots.filter((s) => s.reason !== "PAST") : [];
  const periods = PERIODS.map((name) => {
    const list = upcoming.filter((s) => period(s.time) === name);
    return {
      name,
      slots: list,
      open: list.filter((s) => fits(s, counts)).length,
      range: list.length ? `${list[0].time}–${addMinutesToTime(list[list.length - 1].time, slotMinutes)}` : "",
    };
  }).filter((p) => p.slots.length > 0);
  // Show the part of the day the visitor picked, else the one holding their chosen session, else the first with room.
  const activePeriod =
    periods.find((p) => p.name === periodChoice) ??
    periods.find((p) => slot && p.name === period(slot.time)) ??
    periods.find((p) => p.open > 0) ??
    periods[0];
  const hourMap = new Map<string, PublicSlot[]>();
  for (const s of activePeriod?.slots ?? []) hourMap.set(s.time.slice(0, 2), [...(hourMap.get(s.time.slice(0, 2)) ?? []), s]);
  const hourRows = [...hourMap.entries()];

  const change = useCallback(
    (code: string, delta: number) =>
      setCounts((current) => {
        const next = Math.max(0, (current[code] ?? 0) + delta);
        const updated = { ...current, [code]: next };
        return total(updated) === 0 || total(updated) > maxSeats ? current : updated;
      }),
    [maxSeats],
  );

  const days = today ? Array.from({ length: Math.min(DAYS_SHOWN, bookingWindowDays) }, (_, i) => addDays(today, i)) : [];
  const unitPrice = slot?.pricePaise ?? basePricePaise;
  const seatQuery = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([code, n]) => `${code}:${n}`)
    .join(",");
  const continueHref = slot ? `/book?start=${encodeURIComponent(slot.start)}&seats=${seatQuery}` : undefined;
  const dateLabel = date ? shortDate(date).label : "";

  return (
    <div className={styles.book}>
      <div className={styles.picker}>
        <div className={styles.stepLabel}>
          <span className="tel">
            <b className={styles.stepN}>1</b>Choose your experience
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

        <div className={styles.stepLabel}>
          <span className="tel">
            <b className={styles.stepN}>2</b>Select date
          </span>
        </div>
        <div className={styles.days} role="group" aria-label="Select a date">
          {days.map((d) => {
            const label = shortDate(d);
            return (
              <button
                type="button"
                key={d}
                className={styles.day}
                aria-pressed={d === date}
                onClick={() => {
                  setPickedDate(d);
                  setSelected(null);
                  setPeriodChoice(null);
                }}
              >
                <i>{d === today ? "Today" : label.weekday}</i>
                <b>{label.day}</b>
                <small>{label.month}</small>
              </button>
            );
          })}
          {!today && <span className={styles.daysPlaceholder}>Loading dates…</span>}
        </div>

        <div className={styles.stepLabel}>
          <span className="tel">
            <b className={styles.stepN}>3</b>Pick a time{dateLabel ? ` · ${dateLabel}` : ""}
          </span>
          {day?.hours && (
            <span className="tel">
              {day.hours.opensAt} – {day.hours.closesAt}
            </span>
          )}
        </div>

        <div className={styles.slotsArea} aria-busy={load.status === "loading"}>
          {load.status === "error" && (
            <div className={styles.message}>
              <p>{load.message}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </button>
            </div>
          )}
          {load.status === "loading" && (
            <div className={styles.timetable} aria-hidden="true">
              {Array.from({ length: 3 }, (_, row) => (
                <div className={styles.hourRow} key={row}>
                  <span className={styles.hourLabel} />
                  <div className={styles.chips}>
                    {Array.from({ length: 4 }, (_, i) => (
                      <span key={i} className={`${styles.chip} ${styles.skeleton}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {day && !day.hours && <p className={styles.message}>The venue is closed on {dateLabel}. Pick another date.</p>}
          {day && day.hours && upcoming.length === 0 && (
            <p className={styles.message}>Today&apos;s sessions have all started. Pick another date.</p>
          )}

          {activePeriod && (
            <>
              <div className={styles.periods} role="tablist" aria-label="Part of the day">
                {periods.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    role="tab"
                    aria-selected={p.name === activePeriod.name}
                    className={styles.period}
                    onClick={() => setPeriodChoice(p.name)}
                  >
                    <span className={styles.periodName}>{p.name}</span>
                    <span className={styles.periodMeta}>
                      <span className={styles.periodRange}>{p.range} · </span>
                      {p.open === 0 ? "Full" : `${p.open} open`}
                    </span>
                  </button>
                ))}
              </div>

              <div className={styles.timetable} role="tabpanel" aria-label={`${activePeriod.name} sessions`}>
                {hourRows.map(([hour, list]) => (
                  <div className={styles.hourRow} key={hour}>
                    <span className={styles.hourLabel}>{hour}:00</span>
                    <div className={styles.chips}>
                      {list.map((s) => {
                        const ok = fits(s, counts);
                        const low = s.bookable && s.seatsLeft <= 2;
                        const note = !s.bookable
                          ? REASON_LABEL[s.reason ?? "FULL"]
                          : s.seatsLeft === 1
                            ? "Last seat"
                            : low || !ok
                              ? `${s.seatsLeft} left`
                              : null;
                        return (
                          <button
                            type="button"
                            key={s.start}
                            className={styles.chip}
                            data-state={!s.bookable ? "off" : !ok ? "short" : low ? "low" : "open"}
                            aria-pressed={s.start === slot?.start}
                            aria-label={`${s.time}, ${s.bookable ? `${plural(s.seatsLeft, "seat")} left` : REASON_LABEL[s.reason ?? "FULL"]}`}
                            title={s.bookable && !ok ? `Only ${plural(s.seatsLeft, "seat")} left for your group` : undefined}
                            disabled={!ok}
                            onClick={() => setSelected(s.start)}
                          >
                            <span className={styles.chipTime}>{s.time}</span>
                            <span className={styles.chipFoot}>
                              {note ? (
                                <span className={styles.chipNote}>{note}</span>
                              ) : (
                                <span className={styles.chipBar} aria-hidden="true">
                                  {Array.from({ length: s.capacity }, (_, i) => (
                                    <i key={i} className={i < s.seatsLeft ? styles.on : undefined} />
                                  ))}
                                </span>
                              )}
                            </span>
                            {s.pricePaise !== basePricePaise && <span className={styles.chipPrice}>{formatRupees(s.pricePaise)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.legend} aria-hidden="true">
                <span className={styles.legendItem}>
                  <span className={styles.legendBar}>
                    <i className={styles.on} />
                    <i className={styles.on} />
                    <i className={styles.on} />
                    <i />
                  </span>
                  Seats left
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDash} />
                  Not enough seats for your group
                </span>
              </div>
            </>
          )}
        </div>
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
            <span className={styles.rowVal}>{dateLabel || "—"}</span>
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
