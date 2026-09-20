import { formatRupees } from "@/lib/format";
import { whatsappUrl } from "@/lib/links";
import type { SiteContent } from "@/lib/public-types";
import styles from "./Booking.module.css";
import { BookingWidget } from "./BookingWidget";

export function Booking({ content }: { content: SiteContent }) {
  const whatsapp = whatsappUrl(content.venue.whatsappNumber);
  return (
    <section className="section" id="book">
      <div className="wrap">
        <div className={styles.head}>
          <div className="head" style={{ marginBottom: 0 }}>
            <span className="tel tel-o">Pricing &amp; availability</span>
            <h2>Pick your session.</h2>
            <p>
              One driver is one steering rig. Come alone and share the circuit, or book up to {content.maxSeatsPerBooking} drivers and race your
              friends.
            </p>
          </div>
          <div className={styles.price}>
            <span className={styles.priceNum}>
              {content.hasPriceRules && <small>From</small>}
              {formatRupees(content.basePricePaise)}
            </span>
            <span className="tel">Per person · {content.driveMinutes}-minute drive</span>
          </div>
        </div>

        {content.onlineBookingEnabled ? (
          <BookingWidget
            experiences={content.experiences}
            maxSeats={content.maxSeatsPerBooking}
            timezone={content.venue.timezone}
            bookingWindowDays={content.bookingWindowDays}
            basePricePaise={content.basePricePaise}
            slotMinutes={content.slotMinutes}
          />
        ) : (
          <div className={styles.offline}>
            <div>
              <span className="tel tel-o">Online booking opens soon</span>
              <p>
                {whatsapp ? "Message us on WhatsApp to book a session, or walk in" : "Walk in"} to {content.venue.address} and ask at the desk.
                You pay at the venue.
              </p>
            </div>
            <div className={styles.offlineLinks}>
              {whatsapp && (
                <a className="btn btn-primary" href={whatsapp} target="_blank" rel="noreferrer">
                  Book on WhatsApp <span className="arr">→</span>
                </a>
              )}
              {content.venue.mapsUrl && (
                <a className="btn btn-ghost" href={content.venue.mapsUrl} target="_blank" rel="noreferrer">
                  Get directions <span className="arr">→</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
