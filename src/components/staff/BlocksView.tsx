"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { shortDate } from "@/lib/venue-time";
import styles from "./Blocks.module.css";

type Block = { id: string; reason: string; rig: string | null; createdBy: string | null; dateLabel: string; startLabel: string; endLabel: string; startDate: string };

/** Local wall-clock input ("2026-09-19T14:00") → the matching instant in the venue's timezone. */
function localInputToIso(value: string, timezone: string): string | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match) return null;
  const guess = new Date(`${match[1]}T${match[2]}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(guess)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

export function BlocksView({ blocks, rigs, timezone, today }: { blocks: Block[]; rigs: { id: string; label: string }[]; timezone: string; today: string }) {
  const router = useRouter();
  const [start, setStart] = useState(`${today}T`);
  const [end, setEnd] = useState(`${today}T`);
  const [rigId, setRigId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const startIso = localInputToIso(start, timezone);
    const endIso = localInputToIso(end, timezone);
    if (!startIso || !endIso) return setMessage({ tone: "error", text: "Pick a start and end time." });

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/staff/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "block", start: startIso, end: endIso, rigId: rigId || null, reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The block couldn't be saved.");
      setMessage({ tone: "ok", text: "Blocked. Those seats are off sale." });
      setReason("");
      router.refresh();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "The block couldn't be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function lift(id: string) {
    setBusy(true);
    try {
      await fetch("/api/staff/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "lift-block", blockId: id }) });
      setMessage({ tone: "ok", text: "Block lifted. Seats are on sale again." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header>
        <span className="tel tel-o">Maintenance</span>
        <h1>Blocked sessions</h1>
        <p className={styles.note}>
          Blocking stops seats being sold: one rig, or the whole venue. Bookings already sold are not cancelled automatically, so check the board and
          move or refund anyone affected.
        </p>
      </header>

      {message && (
        <p className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      <form className={styles.card} onSubmit={submit}>
        <span className="tel">New block</span>
        <div className={styles.fields}>
          <label>
            <span>From</span>
            <input required type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input required type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label>
            <span>What&apos;s blocked</span>
            <select value={rigId} onChange={(e) => setRigId(e.target.value)}>
              <option value="">Whole venue</option>
              {rigs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.wide}>
            <span>Reason</span>
            <input required maxLength={200} placeholder="Track repair, power cut, private event…" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Block these sessions"}
        </button>
      </form>

      <section className={styles.card}>
        <span className="tel">Active blocks</span>
        {blocks.length === 0 ? (
          <p className={styles.muted}>Nothing is blocked. Everything is on sale.</p>
        ) : (
          <ul className={styles.list}>
            {blocks.map((b) => (
              <li key={b.id}>
                <span className={styles.blockMain}>
                  <b>{b.rig ?? "Whole venue"}</b>
                  <small>
                    {shortDate(b.startDate).label} · {b.startLabel}–{b.endLabel}
                  </small>
                  <span>{b.reason}</span>
                  {b.createdBy && <small>Blocked by {b.createdBy}</small>}
                </span>
                <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void lift(b.id)}>
                  Lift
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
