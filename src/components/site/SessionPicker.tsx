"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatRupees, plural } from "@/lib/format";
import type { PublicDay, PublicSlot } from "@/lib/public-types";
import { addMinutesToTime, PERIODS, periodOf, slotFits, type Period, type SeatCounts } from "@/lib/sessions";
import { addDays, shortDate, venueNow } from "@/lib/venue-time";
import styles from "./SessionPicker.module.css";

type Props = {
  timezone: string;
  bookingWindowDays: number;
  slotMinutes: number;
  basePricePaise: number;
  /** The group that has to fit. */
  counts: SeatCounts;
  selectedStart: string | null;
  onSelect: (slot: PublicSlot, date: string) => void;
  onDateChange?: (date: string) => void;
  /** Step numbers for the two labels, e.g. [2, 3] in the booking flow. */
  steps?: [number, number];
  /** The booking's current session when moving it. Shown, but not selectable. */
  currentStart?: string;
};

type Result = { key: string } & ({ status: "error"; message: string } | { status: "ready"; day: PublicDay });

const DAYS_SHOWN = 14;

const REASON_LABEL: Record<NonNullable<PublicSlot["reason"]>, string> = {
  PAST: "Started",
  ONLINE_CLOSED: "Walk-in only",
  OUTSIDE_WINDOW: "Not open yet",
  FULL: "Full",
};

function subscribeToMinute(onChange: () => void) {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

/** Date strip, part-of-day tabs and an hour-by-hour timetable of live sessions. */
export function SessionPicker({
  timezone,
  bookingWindowDays,
  slotMinutes,
  basePricePaise,
  counts,
  selectedStart,
  onSelect,
  onDateChange,
  steps,
  currentStart,
}: Props) {
  // "Today" comes from the visitor's clock in the venue's timezone; the server renders no date.
  const today = useSyncExternalStore(subscribeToMinute, () => venueNow(timezone).date, () => null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const date = pickedDate ?? today;
  const [periodChoice, setPeriodChoice] = useState<Period | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = date ? `${date}#${reloadKey}` : null;
  const load = result && result.key === requestKey ? result : ({ status: "loading" } as const);

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
        setResult({ key: requestKey, status: "error", message: error instanceof Error ? error.message : "Sessions couldn't be loaded." });
      });
    return () => controller.abort();
  }, [date, requestKey]);

  const day = load.status === "ready" ? load.day : null;
  const upcoming = day ? day.slots.filter((s) => s.reason !== "PAST") : [];
  const selected = upcoming.find((s) => s.start === selectedStart) ?? null;
  const periods = PERIODS.map((name) => {
    const list = upcoming.filter((s) => periodOf(s.time) === name);
    return {
      name,
      slots: list,
      open: list.filter((s) => s.start !== currentStart && slotFits(s, counts)).length,
      range: list.length ? `${list[0].time}–${addMinutesToTime(list[list.length - 1].time, slotMinutes)}` : "",
    };
  }).filter((p) => p.slots.length > 0);
  const activePeriod =
    periods.find((p) => p.name === periodChoice) ??
    periods.find((p) => selected && p.name === periodOf(selected.time)) ??
    periods.find((p) => p.open > 0) ??
    periods[0];
  const hourMap = new Map<string, PublicSlot[]>();
  for (const s of activePeriod?.slots ?? []) hourMap.set(s.time.slice(0, 2), [...(hourMap.get(s.time.slice(0, 2)) ?? []), s]);
  const hourRows = [...hourMap.entries()];

  const days = today ? Array.from({ length: Math.min(DAYS_SHOWN, bookingWindowDays) }, (_, i) => addDays(today, i)) : [];
  const dateLabel = date ? shortDate(date).label : "";

  return (
    <div className={styles.picker}>
      <div className="step-label">
        <span className="tel">
          {steps && <b className="step-n">{steps[0]}</b>}Select date
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
                setPeriodChoice(null);
                onDateChange?.(d);
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

      <div className="step-label">
        <span className="tel">
          {steps && <b className="step-n">{steps[1]}</b>}Pick a time{dateLabel ? ` · ${dateLabel}` : ""}
        </span>
        {day?.hours && (
          <span className="tel">
            {day.hours.opensAt} – {day.hours.closesAt}
          </span>
        )}
      </div>

      <div className={styles.area} aria-busy={load.status === "loading"}>
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
        {day && day.hours && upcoming.length === 0 && <p className={styles.message}>Sessions for {dateLabel} have all started. Pick another date.</p>}

        {activePeriod && (
          <>
            <div className={styles.periods} role="tablist" aria-label="Part of the day">
              {periods.map((p) => (
                <button key={p.name} type="button" role="tab" aria-selected={p.name === activePeriod.name} className={styles.period} onClick={() => setPeriodChoice(p.name)}>
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
                      const isCurrent = s.start === currentStart;
                      const ok = !isCurrent && slotFits(s, counts);
                      const low = s.bookable && s.seatsLeft <= 2;
                      const note = isCurrent
                        ? "Current"
                        : !s.bookable
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
                          data-state={isCurrent ? "current" : !s.bookable ? "off" : !ok ? "short" : low ? "low" : "open"}
                          aria-pressed={s.start === selectedStart}
                          aria-label={`${s.time}, ${isCurrent ? "your current session" : s.bookable ? `${plural(s.seatsLeft, "seat")} left` : REASON_LABEL[s.reason ?? "FULL"]}`}
                          title={s.bookable && !ok && !isCurrent ? `Only ${plural(s.seatsLeft, "seat")} left for your group` : undefined}
                          disabled={!ok}
                          onClick={() => date && onSelect(s, date)}
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
  );
}
