import Image from "next/image";
import { whatsappUrl } from "@/lib/links";
import type { SiteContent } from "@/lib/public-types";
import { uniformHours, type WeekdayKey } from "@/lib/venue-time";
import { OpenStatus } from "./OpenStatus";
import styles from "./Venue.module.css";

const DAY_NAMES: [WeekdayKey, string][] = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

export function Venue({ content }: { content: SiteContent }) {
  const { venue, weeklyHours } = content;
  const daily = uniformHours(weeklyHours);
  const whatsapp = whatsappUrl(venue.whatsappNumber);

  return (
    <section className={`section ${styles.section}`} id="venue">
      <div className={`media ${styles.sign}`}>
        <Image src="/media/venue-signage.jpg" alt="The illuminated Motion RS4V sign on the plant wall" fill sizes="100vw" />
      </div>
      <div className="wrap">
        <div className={styles.grid}>
          <div>
            <div className="head" style={{ marginBottom: 0 }}>
              <span className="tel tel-o">Find us</span>
              <h2>{venue.address}.</h2>
              <p>Look for the lit Motion RS4V sign on the plant wall. The circuit and the rigs are right behind it.</p>
            </div>
            <dl className={styles.plaque}>
              <div>
                <dt className="tel">Today</dt>
                <dd className={`val ${styles.today}`}>
                  <OpenStatus hours={weeklyHours} timezone={venue.timezone} />
                </dd>
              </div>
              <div>
                <dt className="tel">Hours</dt>
                <dd className="val">
                  {daily ? (
                    `${daily}, every day`
                  ) : (
                    <span className={styles.hoursList}>
                      {DAY_NAMES.map(([key, name]) => (
                        <span key={key}>
                          {name} {weeklyHours[key] ? `${weeklyHours[key].opensAt} – ${weeklyHours[key].closesAt}` : "Closed"}
                        </span>
                      ))}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="tel">Arrive</dt>
                <dd className="val">{content.arriveEarlyMinutes} minutes before your session</dd>
              </div>
              <div>
                <dt className="tel">Minimum age</dt>
                <dd className="val">{content.minAgeYears} years</dd>
              </div>
              <div>
                <dt className="tel">Minimum height</dt>
                <dd className="val">{content.minHeightCm} cm</dd>
              </div>
            </dl>
            <div className={styles.links}>
              {venue.mapsUrl && (
                <a className="btn btn-ghost btn-sm" href={venue.mapsUrl} target="_blank" rel="noreferrer">
                  Open in Maps <span className="arr">→</span>
                </a>
              )}
              {whatsapp && (
                <a className="btn btn-ghost btn-sm" href={whatsapp} target="_blank" rel="noreferrer">
                  WhatsApp us <span className="arr">→</span>
                </a>
              )}
            </div>
          </div>
          <figure className={styles.render}>
            <div className={`media ${styles.renderMedia}`}>
              <Image
                src="/media/venue-interior.jpg"
                alt="Concept render of the RS4V floor with four steering rigs along the branded wall"
                fill
                sizes="(min-width: 900px) 55vw, 100vw"
              />
            </div>
            <figcaption className="tel">Floor concept · rigs along the RS4V wall</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
