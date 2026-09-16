"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./Fleet.module.css";

type Rig = { id: string; label: string; status: string; notes: string | null };
type Car = { id: string; label: string; status: string; experience: { code: string; name: string; trackLabel: string } };

const CAR_STATES = [
  { value: "READY", label: "Ready" },
  { value: "MAINTENANCE", label: "Under repair" },
  { value: "RETIRED", label: "Retired" },
];
const RIG_STATES = [
  { value: "ACTIVE", label: "Working" },
  { value: "MAINTENANCE", label: "Under repair" },
  { value: "RETIRED", label: "Retired" },
];

export function FleetView({ rigs, cars }: { rigs: Rig[]; cars: Car[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function setStatus(kind: "car" | "rig", id: string, status: string, label: string) {
    setBusy(id);
    setMessage(null);
    try {
      const res = await fetch("/api/staff/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "car" ? { action: "car-status", carId: id, status } : { action: "rig-status", rigId: id, status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That didn't work.");
      setMessage(`${label} is now ${(kind === "car" ? CAR_STATES : RIG_STATES).find((s) => s.value === status)?.label.toLowerCase()}.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const readyByTrack = new Map<string, number>();
  for (const c of cars) if (c.status === "READY") readyByTrack.set(c.experience.name, (readyByTrack.get(c.experience.name) ?? 0) + 1);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <span className="tel tel-o">Fleet</span>
          <h1>Cars &amp; rigs</h1>
        </div>
        <p className={styles.summary}>
          {rigs.filter((r) => r.status === "ACTIVE").length} rigs working ·{" "}
          {[...readyByTrack.entries()].map(([name, n]) => `${n} ${name}`).join(" · ") || "no cars ready"}
        </p>
      </header>

      <p className={styles.note}>
        Marking something under repair takes it out of future sessions immediately, and the website stops selling seats it can&apos;t run.
      </p>

      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}

      <section className={styles.card}>
        <span className="tel">Cars</span>
        <ul className={styles.list}>
          {cars.map((car) => (
            <li key={car.id} className={styles.row} data-status={car.status}>
              <span className={styles.label}>
                <b>{car.label}</b>
                <small>{car.experience.trackLabel}</small>
              </span>
              <span className={styles.states}>
                {CAR_STATES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={car.status === s.value}
                    disabled={busy === car.id}
                    onClick={() => void setStatus("car", car.id, s.value, car.label)}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.card}>
        <span className="tel">Rigs</span>
        <ul className={styles.list}>
          {rigs.map((rig) => (
            <li key={rig.id} className={styles.row} data-status={rig.status}>
              <span className={styles.label}>
                <b>{rig.label}</b>
                {rig.notes && <small>{rig.notes}</small>}
              </span>
              <span className={styles.states}>
                {RIG_STATES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={rig.status === s.value}
                    disabled={busy === rig.id}
                    onClick={() => void setStatus("rig", rig.id, s.value, rig.label)}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
