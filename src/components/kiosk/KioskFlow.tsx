"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRupees, plural } from "@/lib/format";
import { loadRazorpay, openRazorpay, type RazorpaySuccess } from "@/lib/razorpay-checkout";
import { Wordmark } from "@/components/site/Wordmark";
import { Keypad } from "./Keypad";
import styles from "./Kiosk.module.css";

type Slot = { start: string; localTime: string; seatsLeft: number; byExperience: Record<string, number>; pricePaise: number };
type Experience = { code: string; name: string; trackLabel: string; tagline: string };

type Started = {
  bookingId: string;
  reference: string;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  keyId: string;
  holdExpiresAt: string;
  prefill: { name: string; email: string; contact: string };
};

type Step = "time" | "drivers" | "name" | "phone";
type Phase =
  | { name: "picking" }
  | { name: "starting" }
  | { name: "paying" }
  | { name: "verifying" }
  /** `comeNow` is decided when the booking lands, not on every render: a kiosk sells both the session
   *  that is running and one later tonight. */
  | { name: "done"; reference: string; comeNow: boolean };

/** How long the finished screen stays up before the next customer gets a clean one. */
const DONE_SECONDS = 25;

/** Called when a booking lands, never during render: the kiosk sells sessions from "now" to later tonight. */
function startsSoon(startIso: string, arriveEarlyMinutes: number) {
  return new Date(startIso).getTime() - Date.now() <= arriveEarlyMinutes * 60_000;
}

function fits(slot: Slot, counts: Record<string, number>) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return total <= slot.seatsLeft && Object.entries(counts).every(([code, n]) => n <= (slot.byExperience[code] ?? 0));
}

export function KioskFlow({
  slots,
  experiences,
  maxSeats,
  idleResetSeconds,
  driveMinutes,
  arriveEarlyMinutes,
  minAgeYears,
  minHeightCm,
}: {
  slots: Slot[];
  experiences: Experience[];
  maxSeats: number;
  idleResetSeconds: number;
  driveMinutes: number;
  arriveEarlyMinutes: number;
  minAgeYears: number;
  minHeightCm: number;
}) {
  const [step, setStep] = useState<Step>("time");
  const [start, setStart] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "picking" });
  const [error, setError] = useState<string | null>(null);

  const slot = slots.find((s) => s.start === start) ?? null;
  const seats = Object.values(counts).reduce((a, b) => a + b, 0);
  const total = (slot?.pricePaise ?? 0) * seats;
  const busy = phase.name === "starting" || phase.name === "paying" || phase.name === "verifying";

  const reset = useCallback(() => {
    setStep("time");
    setStart(null);
    setCounts({});
    setName("");
    setPhone("");
    setPhase({ name: "picking" });
    setError(null);
  }, []);

  // Shared screen: wipe what the last customer typed once they walk away. Never mid-payment.
  useEffect(() => {
    if (busy) return;
    const idle = phase.name === "done" ? DONE_SECONDS * 1000 : idleResetSeconds * 1000;
    let timer = setTimeout(reset, idle);
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, idle);
    };
    window.addEventListener("pointerdown", bump);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
    };
  }, [busy, phase.name, idleResetSeconds, reset]);

  function pick(slotStart: string) {
    setStart(slotStart);
    setCounts({});
    setStep("drivers");
  }

  function change(code: string, delta: number) {
    if (!slot) return;
    const next = { ...counts, [code]: Math.max(0, (counts[code] ?? 0) + delta) };
    const total = Object.values(next).reduce((a, b) => a + b, 0);
    if (total > maxSeats || !fits(slot, next)) return;
    setCounts(next);
  }

  async function verify(response: RazorpaySuccess, reference: string) {
    setPhase({ name: "verifying" });
    try {
      const res = await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "We couldn't confirm that payment.");
      if (body.outcome === "CONFIRMED" || body.outcome === "PENDING") {
        setPhase({ name: "done", reference: body.reference ?? reference, comeNow: !slot || startsSoon(slot.start, arriveEarlyMinutes) });
        return;
      }
      throw new Error(body.message ?? "That payment didn't go through.");
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "We couldn't confirm that payment."} Please show this screen to the desk.`);
      setPhase({ name: "picking" });
    }
  }

  async function pay(started: Started) {
    if (!(await loadRazorpay())) {
      setError("The payment screen couldn't load. Please pay at the desk.");
      setPhase({ name: "picking" });
      return;
    }
    setPhase({ name: "paying" });
    let finished = false;
    openRazorpay(
      {
        key: started.keyId,
        amount: started.amountPaise,
        currency: "INR",
        order_id: started.orderId,
        name: "Motion RS4V",
        description: `${started.reference} · ${slot?.localTime ?? ""}`,
        prefill: started.prefill,
        notes: { reference: started.reference, channel: "kiosk" },
        theme: { color: "#FF6B2C" },
        handler: (response) => {
          finished = true;
          void verify(response, started.reference);
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            if (finished) return;
            setError("Payment wasn't completed. Your seats are held for a few minutes — try again, or ask at the desk.");
            setPhase({ name: "picking" });
          },
        },
      },
      (failure) => setError(failure.error.description ?? "That payment failed. Try another method, or pay at the desk."),
    );
  }

  async function submit() {
    setError(null);
    setPhase({ name: "starting" });
    try {
      const res = await fetch("/api/kiosk/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start,
          seats: experiences.flatMap((e) => Array.from({ length: counts[e.code] ?? 0 }, () => ({ experienceCode: e.code }))),
          customer: { name, phone },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Those seats couldn't be held. Please ask at the desk.");
      await pay(body as Started);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Those seats couldn't be held. Please ask at the desk.");
      setPhase({ name: "picking" });
    }
  }

  if (phase.name === "done") {
    return (
      <main className={`${styles.screen} ${styles.done}`}>
        <span className="tel tel-o">Booked</span>
        <h1>{phase.reference}</h1>
        <p>
          {slot?.localTime} · {plural(seats, "driver")}. Show this number at the desk, or give your mobile number.
        </p>
        <p className={styles.muted}>
          {phase.comeNow
            ? "Go to the counter now — staff will set you up in a rig."
            : `Come back to the counter by ${slot?.localTime}. Please arrive ${arriveEarlyMinutes} minutes early.`}
        </p>
        <button type="button" className={`btn btn-primary ${styles.bigButton}`} onClick={reset}>
          Done
        </button>
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <header className={styles.top}>
        <Wordmark href="/kiosk" />
        {step !== "time" && (
          <button type="button" className={styles.back} onClick={() => setStep(step === "phone" ? "name" : step === "name" ? "drivers" : "time")} disabled={busy}>
            ← Back
          </button>
        )}
      </header>

      {step === "time" && (
        <section className={styles.panel}>
          <h1>Pick a time.</h1>
          <p className={styles.lede}>
            {driveMinutes} minutes behind the wheel · from {formatRupees(Math.min(...slots.map((s) => s.pricePaise)))} per driver
          </p>
          <div className={styles.times}>
            {slots.map((s) => (
              <button key={s.start} type="button" className={styles.time} onClick={() => pick(s.start)}>
                <b>{s.localTime}</b>
                <small>{s.seatsLeft} free</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "drivers" && slot && (
        <section className={styles.panel}>
          <h1>Who&apos;s driving at {slot.localTime}?</h1>
          <p className={styles.lede}>
            One driver, one rig. Up to {maxSeats} per booking. Minimum age {minAgeYears}, minimum height {minHeightCm} cm.
          </p>
          <div className={styles.tracks}>
            {experiences.map((exp) => {
              const n = counts[exp.code] ?? 0;
              return (
                <div key={exp.code} className={styles.track}>
                  <span>
                    <b>{exp.name}</b>
                    <small>{exp.tagline || exp.trackLabel}</small>
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
          <div className={styles.footer}>
            <span className={styles.total}>{seats > 0 ? `${plural(seats, "driver")} · ${formatRupees(total)}` : "Add a driver"}</span>
            <button type="button" className={`btn btn-primary ${styles.bigButton}`} disabled={seats === 0} onClick={() => setStep("name")}>
              Next
            </button>
          </div>
        </section>
      )}

      {step === "name" && (
        <section className={`${styles.panel} ${styles.entryPanel}`}>
          <h1>Your name?</h1>
          <output className={styles.entry}>{name || <i>Tap the letters</i>}</output>
          <Keypad mode="letters" value={name} onChange={setName} maxLength={40} />
          <div className={styles.footer}>
            <button type="button" className={`btn btn-primary ${styles.bigButton}`} disabled={name.trim().length < 2} onClick={() => setStep("phone")}>
              Next
            </button>
          </div>
        </section>
      )}

      {step === "phone" && (
        <section className={`${styles.panel} ${styles.entryPanel}`}>
          <h1>Your mobile number?</h1>
          <p className={styles.lede}>Staff find your booking with this. We don&apos;t call you.</p>
          <output className={styles.entry}>{phone || <i>10 digits</i>}</output>
          <Keypad mode="digits" value={phone} onChange={setPhone} maxLength={10} />
          <div className={styles.footer}>
            <span className={styles.total}>
              {plural(seats, "driver")} · {formatRupees(total)}
            </span>
            <button type="button" className={`btn btn-primary ${styles.bigButton}`} disabled={phone.length < 10 || busy} onClick={() => void submit()}>
              {busy ? "Just a moment…" : `Pay ${formatRupees(total)}`}
            </button>
          </div>
          <p className={styles.muted}>Paying cash? Ask at the desk.</p>
        </section>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
