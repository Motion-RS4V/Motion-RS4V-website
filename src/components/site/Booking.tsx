import { formatRupees } from "@/lib/format";
import type { SiteContent } from "@/lib/public-types";
import styles from "./Booking.module.css";
import { BookingWidget } from "./BookingWidget";

export function Booking({ content }: { content: SiteContent }) {
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

        <BookingWidget
          experiences={content.experiences}
          maxSeats={content.maxSeatsPerBooking}
          timezone={content.venue.timezone}
          bookingWindowDays={content.bookingWindowDays}
          basePricePaise={content.basePricePaise}
          slotMinutes={content.slotMinutes}
        />
      </div>
    </section>
  );
}
