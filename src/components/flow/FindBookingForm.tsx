"use client";

import { useState, type FormEvent } from "react";
import styles from "./FindBooking.module.css";

export function FindBookingForm() {
  const [contact, setContact] = useState("");
  const [state, setState] = useState<{ phase: "idle" | "sending" } | { phase: "done" | "error"; text: string }>({ phase: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ phase: "sending" });
    try {
      const res = await fetch("/api/find-booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That didn't work. Please try again.");
      setState({ phase: "done", text: body.message });
    } catch (e) {
      setState({ phase: "error", text: e instanceof Error ? e.message : "That didn't work. Please try again." });
    }
  }

  if (state.phase === "done") {
    return (
      <div className={styles.done} role="status">
        <span className="tel tel-o">Check your email</span>
        <p>{state.text}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setState({ phase: "idle" })}>
          Try a different number or email
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        <span>Mobile number or email</span>
        <input
          required
          autoComplete="email"
          maxLength={120}
          placeholder="98765 43210 or you@example.com"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </label>
      {state.phase === "error" && (
        <p className={styles.error} role="alert">
          {state.text}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={state.phase === "sending"}>
        {state.phase === "sending" ? "Sending…" : "Email me my booking link"} <span className="arr">→</span>
      </button>
      <p className={styles.note}>
        For your privacy, links only go to the email address saved on the booking. Can&apos;t get to that inbox? Ask at the desk with your name and mobile
        number.
      </p>
    </form>
  );
}
