import styles from "./Fpv.module.css";
import { FpvFrame } from "./FpvFrame";
import { LoopVideo } from "./LoopVideo";

export function Fpv() {
  return (
    <section className={styles.section} id="fpv">
      <FpvFrame className={styles.frame}>
        <div className={`media ${styles.media}`}>
          <LoopVideo
            src="/media/clip-onboard.mp4"
            poster="/media/poster-clip-onboard.jpg"
            label="Onboard camera view from a car following another car around a corner"
          />
        </div>
        <div className={styles.shade} />
        <div className={styles.corners} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className={`wrap ${styles.chrome}`}>
          <span className={`tel ${styles.rec}`}>
            <span className="rec-dot" />
            Onboard camera
          </span>
          <span className={`tel ${styles.chromeRight}`}>Driver&apos;s view</span>
        </div>

        <div className={`wrap ${styles.copy}`}>
          <span className="tel tel-o">FPV · First-person view</span>
          <h2>See what the car sees.</h2>
          <p>
            FPV means <b>first-person view</b>: a live camera on the car itself. You don&apos;t watch the car from across the room.
            You see exactly what it sees, from a few centimetres off the tarmac, in a VR headset or on a screen.
          </p>
        </div>
      </FpvFrame>

      <div className="wrap">
        <div className={styles.defs}>
          <div>
            <span className="tel">You control</span>
            <span className="val">A real RC car on a real circuit</span>
          </div>
          <div>
            <span className="tel">You see</span>
            <span className="val">A live camera feed, not graphics</span>
          </div>
          <div>
            <span className="tel">You need</span>
            <span className="val">No driving experience at all</span>
          </div>
        </div>
      </div>
    </section>
  );
}
