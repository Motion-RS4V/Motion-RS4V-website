"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { readAttribution } from "@/components/site/AttributionCapture";
import { formatRupees, plural } from "@/lib/format";
import { loadRazorpay, openRazorpay, type RazorpaySuccess } from "@/lib/razorpay-checkout";
import styles from "./CheckoutForm.module.css";

type Driver = { experienceCode: string; experience: string; track: string };

type Props = {
  start: string;
  dateLabel: string;
  timeLabel: string;
  drivers: Driver[];
  unitPricePaise: number;
  totalPaise: number;
  gstPaise: number;
  pricesIncludeGst: boolean;
  holdMinutes: number;
  freeCancelHours: number;
  rescheduleCutoffMinutes: number;
  arriveEarlyMinutes: number;
  changeHref: string;
};

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

type Phase =
  | { name: "form" }
  | { name: "starting" }
  | { name: "paying"; checkout: Started }
  | { name: "verifying"; checkout: Started }
  | { name: "interrupted"; checkout: Started; message: string }
  | { name: "unavailable"; refundedPaise: number }
  | { name: "pending"; reference: string };

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  return { seconds: left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` };
}

export function CheckoutForm(props: Props) {
  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [driverNames, setDriverNames] = useState<string[]>(() => props.drivers.map(() => ""));
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);

  const checkout = "checkout" in phase ? phase.checkout : null;
  const statusRef = useRef<HTMLDivElement>(null);

  // If payment is interrupted, bring the explanation into view instead of leaving it below the fold.
  useEffect(() => {
    if (phase.name === "interrupted") statusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [phase.name]);
  const countdown = useCountdown(checkout?.holdExpiresAt ?? null);
  const locked = phase.name !== "form";

  async function verify(started: Started, response: RazorpaySuccess) {
    setPhase({ name: "verifying", checkout: started });
    try {
      const res = await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "We couldn't confirm the payment.");
      if (body.outcome === "CONFIRMED") {
        window.location.assign(body.managePath);
        return;
      }
      if (body.outcome === "REFUNDED_UNAVAILABLE") return setPhase({ name: "unavailable", refundedPaise: body.refundedPaise });
      if (body.outcome === "PENDING") return setPhase({ name: "pending", reference: body.reference });
      setPhase({ name: "interrupted", checkout: started, message: body.message ?? "The payment didn't go through." });
    } catch (e) {
      setPhase({
        name: "interrupted",
        checkout: started,
        message: `${e instanceof Error ? e.message : "We couldn't confirm the payment."} If money left your account, we'll confirm or refund it automatically.`,
      });
    }
  }

  async function pay(started: Started) {
    if (!(await loadRazorpay())) {
      setPhase({ name: "interrupted", checkout: started, message: "The payment window couldn't load. Check your connection and try again." });
      return;
    }
    setPhase({ name: "paying", checkout: started });
    let finished = false;
    openRazorpay(
      {
        key: started.keyId,
        amount: started.amountPaise,
        currency: "INR",
        order_id: started.orderId,
        name: "Motion RS4V",
        description: `${started.reference} · ${props.dateLabel}, ${props.timeLabel}`,
        prefill: started.prefill,
        notes: { reference: started.reference },
        theme: { color: "#FF6B2C" },
        handler: (response) => {
          finished = true;
          void verify(started, response);
        },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            if (!finished) setPhase({ name: "interrupted", checkout: started, message: "Payment wasn't completed. Your seats are still held for a few minutes." });
          },
        },
      },
      (failure) => setError(failure.error.description ?? "That payment attempt failed. You can try another method."),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPhase({ name: "starting" });
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: props.start,
          seats: props.drivers.map((d, i) => ({ experienceCode: d.experienceCode, driverName: driverNames[i] || (i === 0 ? name : "") })),
          customer: { name, phone, email, marketingConsent: consent },
          termsAccepted: terms,
          attribution: readAttribution(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Your seats couldn't be held. Please try again.");
      await pay(body as Started);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your seats couldn't be held. Please try again.");
      setPhase({ name: "form" });
    }
  }

  async function changeSession(started: Started) {
    await fetch("/api/checkout/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: started.orderId }) }).catch(() => {});
    window.location.assign(props.changeHref);
  }

  const groups = new Map<string, { experience: string; track: string; count: number }>();
  for (const d of props.drivers) {
    const g = groups.get(d.experienceCode) ?? { experience: d.experience, track: d.track, count: 0 };
    g.count++;
    groups.set(d.experienceCode, g);
  }

  if (phase.name === "unavailable") {
    return (
      <div className={styles.outcome} role="status">
        <span className="tel tel-o">Seats no longer available</span>
        <h2>Sorry, those seats were taken.</h2>
        <p>
          Your payment arrived after your seat hold ran out and someone else booked the session. We&apos;ve refunded{" "}
          <b>{formatRupees(phase.refundedPaise)}</b> in full. Banks usually take 5–7 working days.
        </p>
        <Link className="btn btn-primary" href={props.changeHref}>
          Pick another time <span className="arr">→</span>
        </Link>
      </div>
    );
  }

  if (phase.name === "pending") {
    return (
      <div className={styles.outcome} role="status">
        <span className="tel tel-o">Payment processing</span>
        <h2>Your payment is still processing.</h2>
        <p>
          Some UPI and bank payments take a minute to settle. We&apos;ll email your confirmation for <b>{phase.reference}</b> as soon as it does. You
          don&apos;t need to pay again.
        </p>
      </div>
    );
  }

  const busyOverlay =
    phase.name === "starting"
      ? { title: "Holding your seats…", body: "Opening the payment window." }
      : phase.name === "verifying"
        ? { title: "Confirming your payment…", body: "Don't close this page. This usually takes a few seconds." }
        : null;

  return (
    <div className={styles.layout}>
      {busyOverlay && (
        <div className={styles.overlay} role="status" aria-live="assertive">
          <div className={styles.overlayCard}>
            <span className={styles.spinner} aria-hidden="true" />
            <strong>{busyOverlay.title}</strong>
            <span>{busyOverlay.body}</span>
          </div>
        </div>
      )}
      <form className={styles.form} onSubmit={submit}>
        <fieldset className={styles.fieldset} disabled={locked}>
          <legend className="step-label">
            <span className="tel">
              <b className="step-n">1</b>Your details
            </span>
          </legend>
          <div className={styles.grid2}>
            <label className={styles.field}>
              <span>Full name</span>
              <input required autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Mobile number</span>
              <input required type="tel" autoComplete="tel" inputMode="tel" placeholder="98765 43210" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <label className={styles.field}>
            <span>Email</span>
            <input required type="email" autoComplete="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} />
            <small>Your confirmation and the link to manage your booking are sent here.</small>
          </label>
        </fieldset>

        <fieldset className={styles.fieldset} disabled={locked}>
          <legend className="step-label">
            <span className="tel">
              <b className="step-n">2</b>Drivers
            </span>
            <span className="tel">Optional</span>
          </legend>
          <div className={styles.drivers}>
            {props.drivers.map((d, i) => (
              <label className={styles.driver} key={i}>
                <span className={styles.driverTag}>
                  <b>Driver {i + 1}</b>
                  <small>{d.experience}</small>
                </span>
                <input
                  maxLength={60}
                  placeholder={i === 0 ? name || "Name" : "Name"}
                  value={driverNames[i]}
                  onChange={(e) => setDriverNames((names) => names.map((n, j) => (j === i ? e.target.value : n)))}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.fieldset} disabled={locked}>
          <legend className="step-label">
            <span className="tel">
              <b className="step-n">3</b>Before you pay
            </span>
          </legend>
          <ul className={styles.policy}>
            <li>Cancel up to {props.freeCancelHours} hours before your session for a full refund. After that, there&apos;s no refund.</li>
            <li>You can move your booking to another time once, up to {props.rescheduleCutoffMinutes} minutes before it starts.</li>
            <li>Arrive {props.arriveEarlyMinutes} minutes early. Sessions start on time, so arriving late shortens your drive.</li>
            <li>Staff assign each driver a car for their chosen track when you arrive.</li>
          </ul>
          <label className={styles.check}>
            <input type="checkbox" required checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>I agree to these booking and cancellation terms.</span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Send me occasional offers and new track announcements. Optional; unsubscribe any time.</span>
          </label>
        </fieldset>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {phase.name === "form" || phase.name === "starting" ? (
          <button className={`btn btn-primary ${styles.pay}`} type="submit" disabled={phase.name === "starting"}>
            {phase.name === "starting" ? "Holding your seats…" : `Pay ${formatRupees(props.totalPaise)}`} <span className="arr">→</span>
          </button>
        ) : (
          <div className={styles.holding} role="status" aria-live="polite" ref={statusRef}>
            <div className={styles.holdingHead}>
              <span className="tel tel-o">{phase.name === "verifying" ? "Confirming payment" : "Seats held"}</span>
              {countdown && phase.name !== "verifying" && (
                <span className={styles.timer}>{countdown.seconds > 0 ? countdown.label : "Hold ended"}</span>
              )}
            </div>
            <p>
              {phase.name === "paying" && "Complete the payment in the Razorpay window."}
              {phase.name === "verifying" && "Payment received. Confirming your booking…"}
              {phase.name === "interrupted" && phase.message}
            </p>
            {phase.name === "interrupted" && (
              <div className={styles.holdingActions}>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => void pay(phase.checkout)}>
                  Try payment again
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => void changeSession(phase.checkout)}>
                  Change session
                </button>
              </div>
            )}
          </div>
        )}
      </form>

      <aside className={styles.slip} aria-label="Order summary">
        <div className={styles.slipHead}>
          <span className="tel">Order summary</span>
          <span className="tel tel-o">{checkout ? checkout.reference : "Online booking"}</span>
        </div>
        <div className={styles.slipBody}>
          <div className={styles.row}>
            <span className="tel">Date</span>
            <span className={styles.rowVal}>{props.dateLabel}</span>
          </div>
          <div className={styles.row}>
            <span className="tel">Time</span>
            <span className={styles.rowVal}>{props.timeLabel}</span>
          </div>
          <div className={styles.row}>
            <span className="tel">Drivers</span>
            <span className={styles.rowVal}>
              {[...groups.values()].map((g) => (
                <span key={g.experience}>
                  {g.count} × {g.experience}
                  <small>{g.track}</small>
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className={styles.total}>
          <div>
            <span className="tel">Total</span>
            <small className={styles.gst}>
              {plural(props.drivers.length, "driver")} × {formatRupees(props.unitPricePaise)}
              {props.gstPaise > 0 && ` · ${props.pricesIncludeGst ? "incl." : "+"} ${formatRupees(props.gstPaise)} GST`}
            </small>
          </div>
          <span className={styles.totalNum}>{formatRupees(props.totalPaise)}</span>
        </div>
        <div className={styles.slipFoot}>
          <p>Secure payment by Razorpay: UPI, cards, netbanking and wallets. Seats are held for {props.holdMinutes} minutes while you pay.</p>
          {!locked && (
            <Link href={props.changeHref} className={styles.change}>
              Change session or drivers
            </Link>
          )}
        </div>
      </aside>
    </div>
  );
}
