"use client";

import { useState, type FormEvent } from "react";
import { Wordmark } from "@/components/site/Wordmark";
import styles from "./StaffLogin.module.css";

export function StaffLoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetNote, setResetNote] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sign in failed.");
      window.location.assign(next?.startsWith("/staff") ? next : "/staff");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <Wordmark href="/" />
        <div className={styles.heading}>
          <span className="tel tel-o">Venue console</span>
          <h1>Staff sign in</h1>
        </div>
        <label className={styles.field}>
          <span>Work email</span>
          <input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Password</span>
          <input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"} <span className="arr">→</span>
        </button>
        {resetNote ? (
          <p className={styles.note} role="status">
            {resetNote}
          </p>
        ) : (
          <button
            type="button"
            className={styles.linkButton}
            onClick={async () => {
              if (!email) return setError("Enter your work email first, then tap this again.");
              setError(null);
              const res = await fetch("/api/staff/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              const body = await res.json();
              setResetNote(res.ok ? body.message : (body.error ?? "That didn't work."));
            }}
          >
            Forgotten your password?
          </button>
        )}
      </form>
    </main>
  );
}
