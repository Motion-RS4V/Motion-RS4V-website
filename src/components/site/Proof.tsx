import Image from "next/image";
import { LoopVideo } from "./LoopVideo";
import styles from "./Proof.module.css";

const LEDGER = [
  { label: "What you see", sim: "Rendered graphics", real: "A live camera on a real car" },
  { label: "Grip & weight", sim: "Calculated by a physics engine", real: "Tyres on asphalt. Nothing is calculated." },
  { label: "If you crash", sim: "Press reset", real: "The car really stops. Staff put it back on track." },
  { label: "The track", sim: "A file on a hard drive", real: "A built circuit with kerbs, hills and landscaping" },
  { label: "Afterwards", sim: "Watch a replay", real: "Walk over and see the car you drove" },
];

export function Proof() {
  return (
    <section className="section" id="proof">
      <div className="wrap">
        <div className={`head ${styles.head}`}>
          <span className="tel tel-o">Real-world proof</span>
          <h2 className={styles.big}>
            This isn&apos;t a simulator<span>.</span>
          </h2>
          <p>Everything you see through the camera exists. The kerbs, the hills, the car ahead of you. When the session ends, you can walk over and look at it.</p>
        </div>

        <div className={styles.ledger} role="table" aria-label="A racing simulator compared with Motion RS4V">
          <div className={`${styles.row} ${styles.rowHead}`} role="row">
            <span className="tel" role="columnheader" />
            <span className="tel" role="columnheader">
              Racing simulator
            </span>
            <span className="tel tel-o" role="columnheader">
              Motion RS4V
            </span>
          </div>
          {LEDGER.map((row) => (
            <div className={styles.row} role="row" key={row.label}>
              <span className="tel" role="rowheader">
                {row.label}
              </span>
              <span className={styles.sim} role="cell">
                {row.sim}
              </span>
              <span className={styles.real} role="cell">
                {row.real}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.evidence}>
          <figure className={styles.item}>
            <div className={`media grade ${styles.frame}`}>
              <LoopVideo src="/media/clip-aerial.mp4" poster="/media/poster-clip-aerial.jpg" label="Aerial view of cars on a landscaped scale circuit" />
            </div>
            <figcaption>
              <span className="tel">The circuit</span>
              <h3>Asphalt, kerbs, hills.</h3>
              <p>A physical track, built at scale and lit for racing.</p>
            </figcaption>
          </figure>
          <figure className={styles.item}>
            <div className={`media grade ${styles.frame}`}>
              <LoopVideo src="/media/clip-carfront.mp4" poster="/media/poster-clip-carfront.jpg" label="A remote-controlled car driving towards the camera on the circuit" />
            </div>
            <figcaption>
              <span className="tel">The car</span>
              <h3>Real weight, real tyres.</h3>
              <p>A real RC car carrying the camera you see through.</p>
            </figcaption>
          </figure>
          <figure className={styles.item}>
            <div className={`media grade ${styles.frame}`}>
              <Image
                src="/media/rig-and-screen.jpg"
                alt="A driver at a steering rig with the circuit camera view on the screen ahead"
                fill
                sizes="(min-width: 760px) 33vw, 100vw"
              />
            </div>
            <figcaption>
              <span className="tel">The rig</span>
              <h3>Wheel, pedals, seat.</h3>
              <p>Wired to a car on the circuit, not to a game.</p>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
