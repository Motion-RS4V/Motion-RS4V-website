"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatRupees } from "@/lib/format";
import { addDays, shortDate } from "@/lib/venue-time";
import styles from "./WalkIn.module.css";

type Slot = { start: string; localTime: string; seatsLeft: number; byExperience: Record<string, number>; pricePaise: number };
type Experience = { code: string; name: string; trackLabel: string };

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI_COUNTER", label: "UPI at desk" },
  { value: "CARD_COUNTER", label: "Card at desk" },
  { value: "COMPLIMENTARY", label: "Complimentary" },
] as const;

export function WalkInForm({
  date,
  slots,
  experiences,
  maxSeats,
  preselectedStart,
}: {
  date: string;
  timezone: string;
  slots: Slot[];
  experiences: Experience[];
  maxSeats: number;
  preselectedStart: string | null;
}) {
  const router = useRouter();
  const [start, setStart] = useState<string | null>(preselectedStart ?? slots[0]?.start ?? null);
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ [experiences[0]?.code ?? "track"]: 1 }));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("CASH");
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; bookingId: string; totalPaise: number } | null>(null);

  const slot = slots.find((s) => s.start === start) ?? null;
  const seats = Object.values(counts).reduce((a, b) => a + b, 0);
  // One line per driver, so staff can name each one. Keys stay stable while counts change.
  const driverSlots = experiences.flatMap((exp) =>
    Array.from({ length: counts[exp.code] ?? 0 }, (_, i) => ({ key: `${exp.code}:${i}`, experience: exp })),
  );
  const total = (slot?.pricePaise ?? 0) * (method === "COMPLIMENTARY" ? 0 : seats);

  function change(code: string, delta: number) {
    setCounts((current) => {
      const next = { ...current, [code]: Math.max(0, (current[code] ?? 0) + delta) };
      const total = Object.values(next).reduce((a, b) => a + b, 0);
      if (total === 0 || total > maxSeats) return current;
      if (slot && total > slot.seatsLeft) return current;
      if (slot && delta > 0 && (next[code] ?? 0) > (slot.byExperience[code] ?? 0)) return current;
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "walk-in",
          start: slot.start,
          seats: driverSlots.map((d, i) => ({
            experienceCode: d.experience.code,
            driverName: driverNames[d.key]?.trim() || (i === 0 ? name : "") || null,
          })),
          customer: { name, phone, email: email || undefined },
          paymentMethod: method,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The seat couldn't be sold.");
      setDone(body);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The seat couldn't be sold.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={styles.done}>
        <span className="tel tel-o">Seat sold</span>
        <h1>{done.reference}</h1>
        <p>
          {formatRupees(done.totalPaise)} · {METHODS.find((m) => m.value === method)?.label}. The seat is now on the board.
        </p>
        <div className={styles.doneActions}>
          <Link className="btn btn-primary btn-sm" href={`/staff/booking/${done.bookingId}`}>
            Open booking to check in <span className="arr">→</span>
          </Link>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              setDone(null);
              setName("");
              setPhone("");
              setEmail("");
              setDriverNames({});
            }}
          >
            Sell another seat
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.page} onSubmit={submit}>
      <header className={styles.head}>
        <div>
          <span className="tel tel-o">Walk-in</span>
          <h1>Sell a seat</h1>
        </div>
        <div className={styles.dates}>
          <Link className="btn btn-ghost btn-sm" href={`/staff/sell?date=${addDays(date, -1)}`}>
            ‹
          </Link>
          <span className={styles.date}>{shortDate(date).label}</span>
          <Link className="btn btn-ghost btn-sm" href={`/staff/sell?date=${addDays(date, 1)}`}>
            ›
          </Link>
        </div>
      </header>

      <section className={styles.card}>
        <span className="tel">Session</span>
        {slots.length === 0 ? (
          <p className={styles.muted}>No sessions left to sell on this date.</p>
        ) : (
          <div className={styles.slots}>
            {slots.map((s) => (
              <button
                key={s.start}
                type="button"
                className={styles.slot}
                aria-pressed={s.start === start}
                onClick={() => setStart(s.start)}
              >
                <b>{s.localTime}</b>
                <small>{s.seatsLeft} free</small>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <span className="tel">Drivers</span>
        <div className={styles.tracks}>
          {experiences.map((exp) => {
            const n = counts[exp.code] ?? 0;
            const left = slot?.byExperience[exp.code] ?? 0;
            return (
              <div key={exp.code} className={styles.track}>
                <span>
                  <b>{exp.name}</b>
                  <small>{slot ? `${left} free` : exp.trackLabel}</small>
                </span>
                <span className={styles.stepper}>
                  <button type="button" onClick={() => change(exp.code, -1)} disabled={n === 0} aria-label={`Fewer ${exp.name} drivers`}>
                    −
                  </button>
                  <output>{n}</output>
                  <button type="button" onClick={() => change(exp.code, 1)} aria-label={`More ${exp.name} drivers`}>
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {driverSlots.length > 0 && (
        <section className={styles.card}>
          <span className="tel">Driver names (optional)</span>
          <div className={styles.drivers}>
            {driverSlots.map((d, i) => (
              <label key={d.key} className={styles.driverRow}>
                <span>
                  <b>Driver {i + 1}</b>
                  <small>{d.experience.name}</small>
                </span>
                <input
                  maxLength={60}
                  placeholder={i === 0 ? name || "Name" : "Name"}
                  value={driverNames[d.key] ?? ""}
                  onChange={(e) => setDriverNames((names) => ({ ...names, [d.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </section>
      )}

      <section className={styles.card}>
        <span className="tel">Customer</span>
        <div className={styles.fields}>
          <label>
            <span>Name</span>
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span>Mobile</span>
            <input required type="tel" inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label>
            <span>Email (optional)</span>
            <input type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
      </section>

      <section className={styles.card}>
        <span className="tel">Payment</span>
        <div className={styles.methods}>
          {METHODS.map((m) => (
            <button key={m.value} type="button" className={styles.method} aria-pressed={method === m.value} onClick={() => setMethod(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.footer}>
        <span className={styles.total}>
          {seats} {seats === 1 ? "driver" : "drivers"} · <b>{formatRupees(total)}</b>
        </span>
        <button className="btn btn-primary" type="submit" disabled={busy || !slot || seats === 0}>
          {busy ? "Selling…" : `Take ${METHODS.find((m) => m.value === method)?.label.toLowerCase()}`} <span className="arr">→</span>
        </button>
      </div>
    </form>
  );
}
