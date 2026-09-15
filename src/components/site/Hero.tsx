import { formatRupees } from "@/lib/format";
import type { SiteContent } from "@/lib/public-types";
import styles from "./Hero.module.css";
import { LoopVideo } from "./LoopVideo";
import { OpenStatus } from "./OpenStatus";

export function Hero({ content }: { content: SiteContent }) {
  return (
    <section className={styles.hero} id="top">
      <div className={`media ${styles.media}`}>
        <LoopVideo
          eager
          src="/media/hero.mp4"
          poster="/media/poster-hero.jpg"
          label="Footage of a real remote-controlled car on a scale circuit, and a driver steering it from a rig"
        />
      </div>
      <div className={styles.shade} />
      <div className={`${styles.letterbox} ${styles.top}`} />
      <div className={`${styles.letterbox} ${styles.bottom}`} />

      <div className={styles.tag}>
        <div className={`wrap ${styles.tagRow}`}>
          <span className={`tel ${styles.rec}`}>
            <span className="rec-dot" />
            Real footage · No CGI
          </span>
          <span className={`tel ${styles.address}`}>{content.venue.address}</span>
        </div>
      </div>

      <div className="wrap">
        <div className={styles.copy}>
          <span className={styles.eyebrow}>
            <span className="dot dot-pulse" />
            <OpenStatus hours={content.weeklyHours} timezone={content.venue.timezone} />
          </span>
          <h1 className={styles.title}>
            <span className={styles.line}>
              <span>Drive a real car.</span>
            </span>
            <span className={styles.line}>
              <span className={styles.orange}>Remotely.</span>
            </span>
          </h1>
          <p className={styles.lede}>
            Sit at a <b>real steering rig</b>, choose a <b>VR headset or a screen</b>, and see live through a camera on a car
            on our circuit. Turn the wheel and <b>the actual car turns.</b>
          </p>
          <div className={styles.actions}>
            <a className="btn btn-primary" href="#book">
              Book a Session <span className="arr">→</span>
            </a>
            <a className="btn btn-ghost" href="#you-turn">
              See How It Works
            </a>
          </div>
        </div>

        <div className={styles.rail}>
          <div>
            <span className="tel">Drive time</span>
            <span className="val">{content.driveMinutes} min</span>
          </div>
          <div>
            <span className="tel">Racers</span>
            <span className="val">Up to {content.maxSeatsPerBooking}</span>
          </div>
          <div className={styles.price}>
            <span className="tel">Per person</span>
            <span className="val">
              {content.hasPriceRules ? "From " : ""}
              {formatRupees(content.basePricePaise)}
            </span>
          </div>
          <div>
            <span className="tel">Experience needed</span>
            <span className="val">None</span>
          </div>
          <div className={styles.cue} aria-hidden="true">
            <span className="tel">Scroll</span>
            <span className={styles.cueLine} />
          </div>
        </div>
      </div>
    </section>
  );
}
