"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ownerAction, OwnerActionError } from "./owner-action";
import styles from "./Owner.module.css";

type Role = "OWNER" | "MANAGER" | "STAFF";
type Account = { id: string; email: string; name: string; role: Role; active: boolean; lastLogin: string | null };
type Message = { tone: "ok" | "error"; text: string; link?: { name: string; url: string } };

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "STAFF", label: "Staff", hint: "Desk: board, check-in, walk-ins, fleet status, blocks, takings." },
  { value: "MANAGER", label: "Manager", hint: "Same desk access as staff for now." },
  { value: "OWNER", label: "Owner", hint: "Everything, including prices, team and reports." },
];

function SetupLink({ link }: { link: { name: string; url: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.linkBox}>
      <span>
        Send this to {link.name} on WhatsApp or email. It lets them choose a password, works once and expires after an hour (Supabase&apos;s default). Don&apos;t post it anywhere public.
      </span>
      <code>{link.url}</code>
      <span className={styles.actions}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            void navigator.clipboard?.writeText(link.url).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </span>
    </div>
  );
}

export function TeamView({ accounts, selfId }: { accounts: Account[]; selfId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  async function run<T>(key: string, body: Record<string, unknown>, onOk: (result: T) => Message) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await ownerAction<T>(body);
      setMessage(onOk(result));
      router.refresh();
      return true;
    } catch (e) {
      setMessage({ tone: "error", text: (e as OwnerActionError).message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const ok = await run<{ setupLink: string; account: { name: string } }>("add", { action: "staff-add", email, name, role }, (r) => ({
      tone: "ok",
      text: `${r.account.name} can use the console once they've set a password.`,
      link: { name: r.account.name, url: r.setupLink },
    }));
    if (ok) {
      setEmail("");
      setName("");
      setRole("STAFF");
    }
  }

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <header>
        <span className="tel tel-o">Owner</span>
        <h1 className={styles.title}>Team</h1>
        <p className={styles.note}>
          Everyone who can sign in to the console. Turning someone off signs them out straight away; their past bookings and actions stay on record.
        </p>
      </header>

      {message && (
        <div className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
          {message.link && <SetupLink link={message.link} />}
        </div>
      )}

      <form className={styles.card} onSubmit={add}>
        <span className="tel">Add someone</span>
        <div className={styles.form}>
          <label>
            <span>Name</span>
            <input required maxLength={80} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span>Email</span>
            <input required type="email" maxLength={120} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            <span>Access</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <p className={`${styles.muted} ${styles.wide}`}>{ROLES.find((r) => r.value === role)?.hint}</p>
        </div>
        <div className={styles.actions}>
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy !== null}>
            {busy === "add" ? "Adding…" : "Add and get setup link"}
          </button>
        </div>
      </form>

      <section className={styles.card}>
        <span className="tel">Accounts</span>
        <ul className={styles.list}>
          {accounts.map((a) => {
            const self = a.id === selfId;
            return (
              <li key={a.id} className={styles.row} data-muted={a.active ? undefined : true}>
                <span className={styles.rowMain}>
                  <b>
                    {a.name} {self && <span className={styles.badge}>You</span>} {!a.active && <span className={styles.badge} data-tone="warn">Off</span>}
                  </b>
                  <span className={styles.meta}>{a.email}</span>
                  <span className={styles.meta}>{a.lastLogin ? `Last signed in ${a.lastLogin}` : "Never signed in"}</span>
                </span>
                <span className={styles.actions}>
                  <select
                    className={styles.input}
                    aria-label={`Access for ${a.name}`}
                    value={a.role}
                    disabled={busy !== null || self}
                    style={{ width: "auto", minHeight: 40 }}
                    onChange={(e) =>
                      void run("role", { action: "staff-update", staffId: a.id, role: e.target.value }, () => ({
                        tone: "ok",
                        text: `${a.name} is now ${ROLES.find((r) => r.value === e.target.value)?.label.toLowerCase()}.`,
                      }))
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {a.active && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy !== null}
                      onClick={() =>
                        void run<{ setupLink: string }>("reset", { action: "staff-reset", staffId: a.id }, (r) => ({
                          tone: "ok",
                          text: `New password link for ${a.name}. Their current password keeps working until they use it.`,
                          link: { name: a.name, url: r.setupLink },
                        }))
                      }
                    >
                      Password link
                    </button>
                  )}
                  {!self && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy !== null}
                      onClick={() => {
                        if (a.active && !window.confirm(`Turn off ${a.name}'s account? They'll be signed out and can't sign in again until you turn it back on.`)) return;
                        void run("active", { action: "staff-update", staffId: a.id, active: !a.active }, () => ({
                          tone: "ok",
                          text: a.active ? `${a.name} is turned off and signed out.` : `${a.name} can sign in again.`,
                        }));
                      }}
                    >
                      {a.active ? "Turn off" : "Turn on"}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
