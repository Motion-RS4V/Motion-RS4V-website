import { InView } from "./InView";
import { LoopVideo } from "./LoopVideo";
import styles from "./YouTurn.module.css";

export function YouTurn() {
  return (
    <section className={`section ${styles.section}`} id="you-turn">
      <div className="wrap">
        <div className={styles.head}>
          <span className="tel tel-o">Same floor · Real car · 20 metres apart</span>
          <h2 className={styles.title}>
            You turn.<span>The car turns.</span>
          </h2>
        </div>

        <InView className={styles.stage}>
          <figure className={styles.side}>
            <div className={`media grade ${styles.frame}`}>
              <LoopVideo
                src="/media/clip-rig.mp4"
                poster="/media/poster-clip-rig.jpg"
                label="A driver steering at a rig, watching the car's camera on the screen"
              />
            </div>
            <figcaption>
              <span className="tel">You</span>
              <span className={`val ${styles.caption}`}>At the rig</span>
            </figcaption>
          </figure>

          <div className={styles.dim} aria-label="20 metres apart">
            <span className={styles.dimVal}>20 m</span>
            <div className={styles.dimLine}>
              <i className={styles.dimFill} />
            </div>
            <span className={`tel ${styles.dimLabel}`}>Apart</span>
          </div>

          <figure className={styles.side}>
            <div className={`media grade ${styles.frame}`}>
              <LoopVideo src="/media/clip-car.mp4" poster="/media/poster-clip-car.jpg" label="A real remote-controlled car driving on the circuit" />
            </div>
            <figcaption>
              <span className="tel">The car</span>
              <span className={`val ${styles.caption}`}>On the circuit</span>
            </figcaption>
          </figure>
        </InView>

        <div className={styles.foot}>
          <p>Every turn of your wheel steers a real car on the circuit across the room. Its camera sends the picture straight back to you.</p>
          <a className="btn btn-ghost btn-sm" href="#how">
            How a session runs <span className="arr">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
