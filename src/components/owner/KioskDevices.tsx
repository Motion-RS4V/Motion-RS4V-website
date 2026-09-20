"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ownerAction, OwnerActionError } from "./owner-action";
import styles from "./Owner.module.css";

type Device = { id: string; label: string; pairedBy: string | null; lastSeen: string | null; revoked: boolean; paired: boolean };
type Message = { tone: "ok" | "error"; text: string; url?: string };

function PairingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.linkBox}>
      <span>
        Open this link <b>on the kiosk screen itself</b>. It sets that screen up and then disappears from the address bar. It works once, within 30
        minutes, and sets up one screen only — after that the link is dead, so it&apos;s no use to anyone who sees it.
      </span>
      <code>{url}</code>
      <span className={styles.actions}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </span>
    </div>
  );
}

export function KioskDevices({ devices, kioskOn }: { devices: Device[]; kioskOn: boolean }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  async function run<T>(key: string, body: Record<string, unknown>, onOk: (result: T) => Message) {
    setBusy(key);
    setMessage(null);
    try {
      setMessage(onOk(await ownerAction<T>(body)));
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
    const ok = await run<{ pairingUrl: string }>("add", { action: "kiosk-add", label }, (r) => ({
      tone: "ok",
      text: "Screen added. Open the link below on that screen to finish setting it up.",
      url: r.pairingUrl,
    }));
    if (ok) setLabel("");
  }

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <header>
        <span className="tel tel-o">Owner</span>
        <h1 className={styles.title}>Kiosk screens</h1>
        <p className={styles.note}>
          Self-service screens at the counter. A screen can only sell once it&apos;s set up here, so the booking page can&apos;t be used from anywhere
          else. Customers pay by UPI or card on the screen; cash still goes through the desk.
        </p>
      </header>

      {!kioskOn && (
        <div className={styles.message} data-tone="error" role="status">
          Kiosk booking is switched off in Settings, so paired screens show &quot;Please book at the desk&quot;.
        </div>
      )}

      {message && (
        <div className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
          {message.url && <PairingLink url={message.url} />}
        </div>
      )}

      <form className={styles.card} onSubmit={add}>
        <span className="tel">Add a screen</span>
        <div className={styles.form}>
          <label>
            <span>Name it</span>
            <input required maxLength={40} autoComplete="off" placeholder="Counter screen" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <div className={styles.actions}>
          <button className="btn btn-primary btn-sm" type="submit" disabled={busy !== null}>
            {busy === "add" ? "Adding…" : "Add and get setup link"}
          </button>
        </div>
      </form>

      <section className={styles.card}>
        <span className="tel">Screens</span>
        {devices.length === 0 ? (
          <p className={styles.muted}>No screens yet.</p>
        ) : (
          <ul className={styles.list}>
            {devices.map((d) => (
              <li key={d.id} className={styles.row} data-muted={d.revoked ? true : undefined}>
                <span className={styles.rowMain}>
                  <b>
                    {d.label}{" "}
                    {d.revoked ? (
                      <span className={styles.badge} data-tone="warn">
                        Removed
                      </span>
                    ) : (
                      !d.paired && <span className={styles.badge}>Not set up yet</span>
                    )}
                  </b>
                  <span className={styles.meta}>{d.lastSeen ? `Last used ${d.lastSeen}` : "Never used"}</span>
                  {d.pairedBy && <span className={styles.meta}>Added by {d.pairedBy}</span>}
                </span>
                <span className={styles.actions}>
                  {!d.revoked && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!confirm(`Stop "${d.label}" selling? It will need setting up again.`)) return;
                        void run(d.id, { action: "kiosk-revoke", deviceId: d.id }, () => ({ tone: "ok", text: `${d.label} can no longer sell.` }));
                      }}
                    >
                      {busy === d.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
