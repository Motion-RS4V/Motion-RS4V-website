"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useId, useState, type FormEvent, type ReactNode } from "react";
import { shortDate } from "@/lib/venue-time";
import type { Settings, SettingsKey } from "@/server/settings/schema";
import styles from "./Settings.module.css";

type Stranded = { reference: string; date: string; time: string };
type Message = { tone: "ok" | "error"; text: string; stranded?: Stranded[] };

const ErrorsContext = createContext<Record<string, string>>({});

/** The server's message for a field, keyed by its path inside the group ("weeklyHours.mon.closesAt"). */
export function useFieldError(path: string): string | undefined {
  return useContext(ErrorsContext)[path];
}

function friendly(message: string): string {
  return /received (null|NaN)/i.test(message) ? "Enter a number." : message;
}

type Editor<T> = {
  draft: T;
  set: <F extends keyof T>(field: F, value: T[F]) => void;
  replace: (next: T) => void;
};

/**
 * One settings group as its own card: edit a local draft, then save the whole group.
 * The server validates everything again; its field errors show next to the matching inputs.
 */
export function SettingsForm<K extends SettingsKey>({
  group,
  id,
  eyebrow,
  title,
  description,
  initial,
  children,
}: {
  group: K;
  id: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  initial: Settings[K];
  children: (editor: Editor<Settings[K]>) => ReactNode;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  // Bumped on discard so number inputs drop any half-typed text.
  const [revision, setRevision] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const editor: Editor<Settings[K]> = {
    draft,
    set: (field, value) => setDraft((d) => ({ ...d, [field]: value })),
    replace: setDraft,
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      const res = await fetch("/api/owner/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: group, value: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const issues: { path: string; message: string }[] = body.issues ?? [];
        setErrors(Object.fromEntries(issues.map((i) => [i.path, friendly(i.message)])));
        const text = issues.length > 1 ? `${issues.length} values need fixing before this can be saved.` : friendly(body.error ?? "Couldn't save. Try again.");
        setMessage({ tone: "error", text, stranded: body.stranded });
        return;
      }
      setSaved(body.value);
      setDraft(body.value);
      setMessage({ tone: "ok", text: "Saved. The website and booking rules use this now." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Couldn't reach the server. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    setDraft(saved);
    setErrors({});
    setMessage(null);
    setRevision((r) => r + 1);
  }

  return (
    <form id={id} className={styles.card} onSubmit={submit} noValidate>
      <header className={styles.cardHead}>
        <span className="tel tel-o">{eyebrow}</span>
        <h2>{title}</h2>
        <p className={styles.note}>{description}</p>
      </header>

      <ErrorsContext.Provider value={errors}>
        <div key={revision} className={styles.body}>
          {children(editor)}
        </div>
      </ErrorsContext.Provider>

      {message && (
        <div className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          <p>{message.text}</p>
          {message.stranded && message.stranded.length > 0 && (
            <ul className={styles.stranded}>
              {message.stranded.map((s) => (
                <li key={s.reference}>
                  <b>{s.reference}</b> {shortDate(s.date).label} · {s.time}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <footer className={styles.actions}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        {dirty && !busy && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={discard}>
            Discard
          </button>
        )}
        {dirty && <span className={styles.unsaved}>Unsaved changes</span>}
      </footer>
    </form>
  );
}

function FieldShell({ label, hint, path, id, wide, children }: { label: string; hint?: string; path: string; id: string; wide?: boolean; children: ReactNode }) {
  const error = useFieldError(path);
  return (
    <div className={styles.field} data-wide={wide || undefined} data-invalid={error ? true : undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <small className={styles.error} id={`${id}-msg`}>
          {error}
        </small>
      ) : (
        hint && <small id={`${id}-msg`}>{hint}</small>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  path,
  value,
  onChange,
  type = "text",
  wide,
  placeholder,
}: {
  label: string;
  hint?: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "url" | "tel";
  wide?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <FieldShell label={label} hint={hint} path={path} id={id} wide={wide}>
      <input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-msg`} />
    </FieldShell>
  );
}

/**
 * Whole numbers by default. `scale` stores a different unit than the owner types: rupees in, paise saved.
 * Keeps its own text so "499." or an empty box survive while typing; an empty box is sent as missing.
 */
export function NumberField({
  label,
  hint,
  path,
  value,
  onChange,
  unit,
  scale = 1,
  decimals = 0,
  min = 0,
}: {
  label: string;
  hint?: string;
  path: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  scale?: number;
  decimals?: number;
  min?: number;
}) {
  const id = useId();
  const [text, setText] = useState(Number.isFinite(value) ? String(value / scale) : "");
  return (
    <FieldShell label={label} hint={hint} path={path} id={id}>
      <span className={styles.unitInput}>
        <input
          id={id}
          type="number"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          min={min}
          step={decimals > 0 ? 1 / 10 ** decimals : 1}
          value={text}
          aria-describedby={`${id}-msg`}
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.value.trim() === "" ? NaN : Number(e.target.value);
            onChange(Number.isFinite(n) ? Math.round(n * scale) : NaN);
          }}
        />
        {unit && <span>{unit}</span>}
      </span>
    </FieldShell>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.switch} aria-hidden />
      <span className={styles.toggleText}>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}
