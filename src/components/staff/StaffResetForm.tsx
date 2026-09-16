"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Wordmark } from "@/components/site/Wordmark";
import styles from "./StaffLogin.module.css";

const MIN_LENGTH = 10;

export function StaffResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");

  // Built on demand, never during render, so React can keep renders pure.
  const clientRef = useRef<SupabaseClient | null>(null);
  const client = () => (clientRef.current ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!));

  useEffect(() => {
    // The link carries a one-time code (or a recovery session in the hash); turn it into a session.
    const code = new URLSearchParams(window.location.search).get("code");
    const supabase = client();
    const finish = code
      ? supabase.auth.exchangeCodeForSession(code).then(({ error }) => !error)
      : supabase.auth.getSession().then(({ data }) => Boolean(data.session));
    finish.then((valid) => setReady(valid ? "ok" : "invalid"));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== again) return setError("Both passwords must match.");
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    setBusy(true);
    setError(null);
    const { error: updateError } = await client().auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return;
    }
    router.replace("/staff");
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <Wordmark href="/" />
        <div className={styles.heading}>
          <span className="tel tel-o">Venue console</span>
          <h1>Set a new password</h1>
        </div>

        {ready === "checking" && <p className={styles.note}>Checking your link…</p>}
        {ready === "invalid" && (
          <p className={styles.error} role="alert">
            This reset link has expired or has already been used. Ask for a new one from the sign-in page.
          </p>
        )}
        {ready === "ok" && (
          <>
            <label className={styles.field}>
              <span>New password</span>
              <input required type="password" autoComplete="new-password" minLength={MIN_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Repeat it</span>
              <input required type="password" autoComplete="new-password" minLength={MIN_LENGTH} value={again} onChange={(e) => setAgain(e.target.value)} />
            </label>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save and sign in"} <span className="arr">→</span>
            </button>
          </>
        )}
      </form>
    </main>
  );
}
