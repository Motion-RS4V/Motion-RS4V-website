"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { shortDate } from "@/lib/venue-time";
import { ownerAction, OwnerActionError, type Stranded } from "./owner-action";
import styles from "./Owner.module.css";

type Override = { date: string; closed: boolean; opensAt: string | null; closesAt: string | null; note: string | null };
type Message = { tone: "ok" | "error"; text: string; stranded?: Stranded[] };

export function SpecialDatesView({ overrides, today }: { overrides: Override[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [closed, setClosed] = useState(true);
  const [opensAt, setOpensAt] = useState("10:00");
  const [closesAt, setClosesAt] = useState("22:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function run(label: string, body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await ownerAction(body);
      setMessage({ tone: "ok", text: done });
      router.refresh();
      return true;
    } catch (e) {
      const err = e as OwnerActionError;
      setMessage({ tone: "error", text: err.message ?? `Couldn't ${label}.`, stranded: err.stranded });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      "save",
      { action: "override-save", date, closed, opensAt: closed ? null : opensAt, closesAt: closed ? null : closesAt, note: note || null },
      closed ? `${shortDate(date).label} is now closed. Online booking for that day has stopped.` : `${shortDate(date).label} now runs ${opensAt}–${closesAt}.`,
    );
    if (ok) setNote("");
  }

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <header>
        <span className="tel tel-o">Owner</span>
        <h1 className={styles.title}>Special dates</h1>
        <p className={styles.note}>
          Close the venue for a day, or give one date different hours, without touching the weekly schedule. A date that already has bookings outside the new hours
          can&apos;t be changed until they&apos;re moved or cancelled.
        </p>
      </header>

      {message && (
        <div className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
          {message.stranded && message.stranded.length > 0 && (
            <ul>
              {message.stranded.map((s) => (
                <li key={s.reference}>
                  {s.reference} · {s.time}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form className={styles.card} onSubmit={submit}>
        <span className="tel">Add or change a date</span>
        <div className={styles.form}>
          <label>
            <span>Date</span>
            <input type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
            Closed all day
          </label>
          {!closed && (
            <>
              <label>
                <span>Opens</span>
                <input type="time" step={300} required value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
              </label>
              <label>
                <span>Closes</span>
                <input type="time" step={300} required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
              </label>
            </>
          )}
          <label className={styles.wide}>
            <span>Note (staff only)</span>
            <input maxLength={120} placeholder="Diwali, private event, power maintenance…" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className={styles.actions}>
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save date"}
          </button>
        </div>
      </form>

      <section className={styles.card}>
        <span className="tel">Upcoming special dates</span>
        {overrides.length === 0 ? (
          <p className={styles.muted}>None. Every day follows the weekly hours.</p>
        ) : (
          <ul className={styles.list}>
            {overrides.map((o) => (
              <li key={o.date} className={styles.row}>
                <span className={styles.rowMain}>
                  <b>
                    {shortDate(o.date).label} {o.date.slice(0, 4)}
                  </b>
                  <span>{o.closed ? <span className={styles.badge} data-tone="warn">Closed</span> : `Open ${o.opensAt}–${o.closesAt}`}</span>
                  {o.note && <span className={styles.meta}>{o.note}</span>}
                </span>
                <span className={styles.actions}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setDate(o.date);
                      setClosed(o.closed);
                      if (o.opensAt) setOpensAt(o.opensAt);
                      if (o.closesAt) setClosesAt(o.closesAt);
                      setNote(o.note ?? "");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void run("remove", { action: "override-remove", date: o.date }, `${shortDate(o.date).label} is back on the weekly hours.`)}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
