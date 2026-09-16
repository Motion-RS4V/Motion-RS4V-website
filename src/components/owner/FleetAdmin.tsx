"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ownerAction, OwnerActionError } from "./owner-action";
import styles from "./Owner.module.css";

type Rig = { id: string; label: string; status: string; notes: string | null };
type Car = { id: string; label: string; status: string; notes: string | null; experience: { code: string; name: string } };
type Experience = { code: string; name: string };

function EditRow({
  label,
  notes,
  busy,
  onSave,
  onCancel,
}: {
  label: string;
  notes: string | null;
  busy: boolean;
  onSave: (label: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [l, setL] = useState(label);
  const [n, setN] = useState(notes ?? "");
  return (
    <form
      className={styles.form}
      style={{ flex: "1 1 100%" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(l, n);
      }}
    >
      <label>
        <span>Name</span>
        <input required maxLength={40} value={l} onChange={(e) => setL(e.target.value)} />
      </label>
      <label>
        <span>Notes</span>
        <input maxLength={200} value={n} onChange={(e) => setN(e.target.value)} />
      </label>
      <span className={styles.actions}>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
      </span>
    </form>
  );
}

/** Owner-only: add, rename and order rigs and cars. Status changes stay on the shared fleet controls above. */
export function FleetAdmin({ rigs, cars, experiences }: { rigs: Rig[]; cars: Car[]; experiences: Experience[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [rigLabel, setRigLabel] = useState("");
  const [carLabel, setCarLabel] = useState("");
  const [carTrack, setCarTrack] = useState(experiences[0]?.code ?? "");

  async function run(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await ownerAction(body);
      setMessage({ tone: "ok", text: ok });
      setEditing(null);
      router.refresh();
      return true;
    } catch (e) {
      setMessage({ tone: "error", text: (e as OwnerActionError).message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addRig(event: FormEvent) {
    event.preventDefault();
    if (await run({ action: "rig-create", label: rigLabel }, `${rigLabel.trim()} added and working. Every future session gains a seat.`)) setRigLabel("");
  }

  async function addCar(event: FormEvent) {
    event.preventDefault();
    const track = experiences.find((x) => x.code === carTrack)?.name ?? "its track";
    if (await run({ action: "car-create", label: carLabel, experienceCode: carTrack }, `${carLabel.trim()} added and ready for ${track}.`)) setCarLabel("");
  }

  const activeRigs = rigs.filter((r) => r.status !== "RETIRED");

  return (
    <section className={styles.card} aria-labelledby="fleet-admin">
      <div>
        <span className="tel tel-o">Owner</span>
        <h2 id="fleet-admin">Manage the fleet</h2>
        <p className={styles.note}>
          Add a rig or car when you buy one, rename it, or change the rig order check-in fills from. To stop using one, mark it Retired above: its history stays.
        </p>
      </div>

      {message && (
        <p className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      <div className={styles.form}>
        <form className={styles.field} onSubmit={addRig}>
          <span>New rig</span>
          <span className={styles.actions} style={{ flexWrap: "nowrap" }}>
            <input className={styles.input} required maxLength={40} placeholder="Rig 5" value={rigLabel} onChange={(e) => setRigLabel(e.target.value)} />
            <button className="btn btn-ghost btn-sm" type="submit" disabled={busy}>
              Add
            </button>
          </span>
        </form>
        <form className={styles.field} onSubmit={addCar}>
          <span>New car</span>
          <span className={styles.actions} style={{ flexWrap: "nowrap" }}>
            <input className={styles.input} required maxLength={40} placeholder="T5" value={carLabel} onChange={(e) => setCarLabel(e.target.value)} />
            <select className={styles.input} aria-label="Track" value={carTrack} onChange={(e) => setCarTrack(e.target.value)} style={{ width: "auto" }}>
              {experiences.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.name}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" type="submit" disabled={busy}>
              Add
            </button>
          </span>
        </form>
      </div>

      <span className="tel">Rigs, in check-in order</span>
      <ul className={styles.list}>
        {activeRigs.map((rig, i) => (
          <li key={rig.id} className={styles.row}>
            {editing === rig.id ? (
              <EditRow
                label={rig.label}
                notes={rig.notes}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={(label, notes) => void run({ action: "rig-update", rigId: rig.id, label, notes }, `Saved ${label}.`)}
              />
            ) : (
              <>
                <span className={styles.rowMain}>
                  <b>{rig.label}</b>
                  {rig.notes && <span className={styles.meta}>{rig.notes}</span>}
                </span>
                <span className={styles.actions}>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label={`Move ${rig.label} up`} disabled={busy || i === 0} onClick={() => void run({ action: "rig-move", rigId: rig.id, direction: "up" }, "Order saved.")}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Move ${rig.label} down`}
                    disabled={busy || i === activeRigs.length - 1}
                    onClick={() => void run({ action: "rig-move", rigId: rig.id, direction: "down" }, "Order saved.")}
                  >
                    ↓
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(rig.id)}>
                    Rename
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <span className="tel">Cars</span>
      <ul className={styles.list}>
        {cars
          .filter((c) => c.status !== "RETIRED")
          .map((car) => (
            <li key={car.id} className={styles.row}>
              {editing === car.id ? (
                <EditRow
                  label={car.label}
                  notes={car.notes}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(label, notes) => void run({ action: "car-update", carId: car.id, label, notes }, `Saved ${label}.`)}
                />
              ) : (
                <>
                  <span className={styles.rowMain}>
                    <b>{car.label}</b>
                    <span className={styles.meta}>
                      {car.experience.name}
                      {car.notes ? ` · ${car.notes}` : ""}
                    </span>
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(car.id)}>
                    Rename
                  </button>
                </>
              )}
            </li>
          ))}
      </ul>
    </section>
  );
}
