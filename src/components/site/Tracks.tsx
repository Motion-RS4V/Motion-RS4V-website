import type { PublicExperience } from "@/lib/public-types";
import { CarDrawing } from "./CarDrawing";
import { PickExperienceLink } from "./PickExperienceLink";
import styles from "./Tracks.module.css";

/** Marketing detail per experience code. Names and taglines come from the database. */
const DETAIL: Record<
  string,
  { drawing: "track" | "offroad"; body: string; meters: [string, number][]; terrain: string; bestFor: string }
> = {
  track: {
    drawing: "track",
    body: "The asphalt racing track: clean lines, kerbs and fast laps. Cars here run low, grippy and quick to rotate, with enough slide to be fun when you lift off.",
    meters: [
      ["Asphalt grip", 5],
      ["Rotation", 4],
      ["Ground clearance", 1],
    ],
    terrain: "Asphalt",
    bestFor: "Fast laps",
  },
  offroad: {
    drawing: "offroad",
    body: "The off-road track: rough terrain through the landscaped section, where line choice matters more than speed. Cars here run long suspension travel and chunkier tyres.",
    meters: [
      ["Asphalt grip", 3],
      ["Rotation", 2],
      ["Ground clearance", 5],
    ],
    terrain: "Rough, mixed",
    bestFor: "Technical driving",
  },
};

export function Tracks({ experiences }: { experiences: PublicExperience[] }) {
  const shown = experiences.filter((e) => DETAIL[e.code]);
  return (
    <section className={`section ${styles.section}`} id="tracks">
      <div className="wrap">
        <div className="head">
          <span className="tel tel-o">The experiences</span>
          <h2>Choose your track.</h2>
          <p>
            You pick the experience when you book. When you arrive, staff assign you a car set up for that track from whichever are ready, so you book a
            driving experience, not a specific car.
          </p>
        </div>

        <div className={styles.sheets}>
          {shown.map((exp) => {
            const d = DETAIL[exp.code];
            return (
              <article className={styles.sheet} key={exp.code}>
                <div className={styles.sheetHead}>
                  <span className="tel tel-o">{exp.trackLabel}</span>
                  <span className={styles.avail}>
                    <span className="dot" />
                    Sessions daily
                  </span>
                </div>
                <div className={styles.body}>
                  <h3 className={styles.name}>{exp.name}</h3>
                  <div className={styles.draw}>
                    <CarDrawing variant={d.drawing} />
                  </div>
                  <p className={styles.copy}>{d.body}</p>
                  <div className={styles.meters}>
                    {d.meters.map(([label, value]) => (
                      <div className={styles.meter} key={label}>
                        <span className="tel">{label}</span>
                        <span className={styles.segs} aria-label={`${value} out of 5`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <i key={n} className={n <= value ? styles.on : undefined} />
                          ))}
                        </span>
                      </div>
                    ))}
                    <span className={styles.note}>Typical car for this track · relative, not measured</span>
                  </div>
                  <div className={styles.specs}>
                    <div>
                      <span className="tel">Terrain</span>
                      <span className="val">{d.terrain}</span>
                    </div>
                    <div>
                      <span className="tel">Best for</span>
                      <span className="val">{d.bestFor}</span>
                    </div>
                  </div>
                  <PickExperienceLink code={exp.code} className={`btn btn-ghost btn-sm ${styles.cta}`}>
                    Book {exp.name} <span className="arr">→</span>
                  </PickExperienceLink>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
