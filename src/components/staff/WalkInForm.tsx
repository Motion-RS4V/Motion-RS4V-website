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

function fits(slot: Slot, counts: Record<string, number>) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return total <= slot.seatsLeft && Object.entries(counts).every(([code, n]) => n <= (slot.byExperience[code] ?? 0));
}

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
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ [experiences[0]?.code ?? "track"]: 1 }));
  const [start, setStart] = useState<string | null>(() => preselectedStart ?? slots.find((s) => fits(s, counts))?.start ?? null);
  const [showNames, setShowNames] = useState(false);
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

  // Drivers come first; the session list then only offers times with room for all of them.
  function change(code: string, delta: number) {
    const next = { ...counts, [code]: Math.max(0, (counts[code] ?? 0) + delta) };
    const total = Object.values(next).reduce((a, b) => a + b, 0);
    if (total === 0 || total > maxSeats) return;
    setCounts(next);
    if (slot && !fits(slot, next)) setStart(slots.find((s) => fits(s, next))?.start ?? null);
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

  const methodLabel = METHODS.find((m) => m.value === method)?.label ?? "";
  const lines = experiences.filter((exp) => (counts[exp.code] ?? 0) > 0).map((exp) => `${counts[exp.code]} ${exp.name}`);

  return (
    <form className={styles.page} onSubmit={submit}>
      <header className={styles.head}>
        <div>
          <span className="tel tel-o">Walk-in</span>
          <h1>Sell a seat</h1>
        </div>
        <div className={styles.dates}>
          <Link className="btn btn-ghost btn-sm" href={`/staff/sell?date=${addDays(date, -1)}`} aria-label="Previous day">
            ‹
          </Link>
          <span className={styles.date}>{shortDate(date).label}</span>
          <Link className="btn btn-ghost btn-sm" href={`/staff/sell?date=${addDays(date, 1)}`} aria-label="Next day">
            ›
          </Link>
        </div>
      </header>

      <div className={styles.steps}>
        <section className={styles.card}>
          <h2 className={styles.step}>
            <i>1</i> How many drivers?
          </h2>
          <div className={styles.tracks}>
            {experiences.map((exp) => {
              const n = counts[exp.code] ?? 0;
              return (
                <div key={exp.code} className={styles.track}>
                  <span>
                    <b>{exp.name}</b>
                    <small>{slot ? `${slot.byExperience[exp.code] ?? 0} free at ${slot.localTime}` : exp.trackLabel}</small>
                  </span>
                  <span className={styles.stepper}>
                    <button type="button" onClick={() => change(exp.code, -1)} disabled={n === 0 || seats === 1} aria-label={`Fewer ${exp.name} drivers`}>
                      −
                    </button>
                    <output>{n}</output>
                    <button type="button" onClick={() => change(exp.code, 1)} disabled={seats >= maxSeats} aria-label={`More ${exp.name} drivers`}>
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.card}>
          <h2 className={styles.step}>
            <i>2</i> Which session?
          </h2>
          {slots.length === 0 ? (
            <p className={styles.muted}>No sessions left to sell on this date.</p>
          ) : (
            <div className={styles.slots}>
              {slots.map((s) => {
                const ok = fits(s, counts);
                return (
                  <button key={s.start} type="button" className={styles.slot} aria-pressed={s.start === start} disabled={!ok} onClick={() => setStart(s.start)}>
                    <b>{s.localTime}</b>
                    <small>{ok ? `${s.seatsLeft} free` : s.seatsLeft === 0 ? "Full" : `Only ${s.seatsLeft} free`}</small>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.step}>
            <i>3</i> Customer
          </h2>
          <div className={styles.fields}>
            <label>
              <span>Name</span>
              <input required maxLength={80} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <span>Mobile</span>
              <input required type="tel" inputMode="tel" maxLength={20} autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className={styles.wide}>
              <span>Email (optional)</span>
              <input type="email" maxLength={120} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>

          <button type="button" className={styles.reveal} aria-expanded={showNames} onClick={() => setShowNames((v) => !v)}>
            {showNames ? "Hide driver names" : "+ Add each driver’s name (optional)"}
          </button>
          {showNames && (
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
          )}
        </section>
      </div>

      <aside className={`${styles.card} ${styles.summary}`}>
        <span className="tel">Summary</span>
        <dl className={styles.lines}>
          <div>
            <dt>Session</dt>
            <dd>{slot ? `${slot.localTime} · ${shortDate(date).label}` : "Pick a session"}</dd>
          </div>
          <div>
            <dt>Drivers</dt>
            <dd>{lines.join(" · ")}</dd>
          </div>
          {slot && (
            <div>
              <dt>Price</dt>
              <dd>
                {formatRupees(slot.pricePaise)} × {seats}
              </dd>
            </div>
          )}
        </dl>

        <div className={styles.payment}>
          <span className="tel">Payment</span>
          <div className={styles.methods}>
            {METHODS.map((m) => (
              <button key={m.value} type="button" className={styles.method} aria-pressed={method === m.value} onClick={() => setMethod(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.total}>
          <span className="tel">Total</span>
          <b>{formatRupees(total)}</b>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button className={`btn btn-primary ${styles.sell}`} type="submit" disabled={busy || !slot || seats === 0}>
          {busy ? "Selling…" : method === "COMPLIMENTARY" ? "Sell as complimentary" : `Take ${methodLabel.toLowerCase()} · ${formatRupees(total)}`}
        </button>
      </aside>
    </form>
  );
}
