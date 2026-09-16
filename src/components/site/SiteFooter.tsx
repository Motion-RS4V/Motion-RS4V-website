import Image from "next/image";
import Link from "next/link";
import { formatRupees } from "@/lib/format";
import { whatsappUrl } from "@/lib/links";
import type { SiteContent } from "@/lib/public-types";
import { uniformHours } from "@/lib/venue-time";
import styles from "./SiteFooter.module.css";
import { Wordmark } from "./Wordmark";

export function FinalCta({ content }: { content: SiteContent }) {
  const daily = uniformHours(content.weeklyHours);
  return (
    <section className={styles.final}>
      <div className={`wrap ${styles.finalInner}`}>
        <div>
          <span className="tel">Drive Beyond Reality</span>
          <h2 className={styles.finalTitle}>
            {content.driveMinutes} minutes.
            <br />
            A real car.
            <br />
            {content.hasPriceRules ? "From " : ""}
            {formatRupees(content.basePricePaise)}.
          </h2>
          <p>
            Your wheel. A car twenty metres away. {content.venue.address}
            {daily ? `, open every day until ${daily.split(" – ")[1]}.` : "."}
          </p>
        </div>
        <a className="btn btn-ink" href="#book">
          Book a Session <span className="arr">→</span>
        </a>
      </div>
    </section>
  );
}

export function SiteFooter({ content }: { content: SiteContent }) {
  const { venue } = content;
  const whatsapp = whatsappUrl(venue.whatsappNumber);
  const daily = uniformHours(content.weeklyHours);
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className="wrap">
        <div className={styles.top}>
          <div className={styles.brand}>
            <Wordmark />
            <p>India&apos;s first HyperReal Teleops FPV Circuit. Real cars, a real track, driven from twenty metres away.</p>
            <Image src="/media/badge.png" alt="Motion RS4V circular badge" width={88} height={88} />
          </div>
          <div>
            <h4>Experience</h4>
            <ul>
              <li><a href="#you-turn">How It Works</a></li>
              <li><a href="#fpv">What is FPV?</a></li>
              <li><a href="#tracks">Choose Your Track</a></li>
              <li><a href="#proof">Not a Simulator</a></li>
            </ul>
          </div>
          <div>
            <h4>Bookings</h4>
            <ul>
              <li><a href="#book">Book a Session</a></li>
              <li><Link href="/find-booking">Find My Booking</Link></li>
              <li><Link href="/terms#safety">Safety &amp; Requirements</Link></li>
              <li><Link href="/refunds">Cancellation &amp; Refunds</Link></li>
            </ul>
          </div>
          <div>
            <h4>Visit</h4>
            <ul>
              <li>{venue.mapsUrl ? <a href={venue.mapsUrl} target="_blank" rel="noreferrer">{venue.address}</a> : <a href="#venue">{venue.address}</a>}</li>
              <li><a href="#venue">{daily ? `Open daily ${daily}` : "Opening hours"}</a></li>
              {whatsapp && <li><a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp</a></li>}
              {venue.instagramHandle && (
                <li>
                  <a href={`https://instagram.com/${venue.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
                    Instagram
                  </a>
                </li>
              )}
              {venue.email && <li><a href={`mailto:${venue.email}`}>{venue.email}</a></li>}
            </ul>
          </div>
        </div>
        <div className={styles.word} aria-hidden="true">
          RS<i>4</i>V
        </div>
        <div className={styles.legal}>
          <span>© {year} Motion RS4V. All rights reserved.</span>
          <nav className={styles.legalLinks} aria-label="Policies">
            <Link href="/terms">Terms</Link>
            <Link href="/refunds">Refunds</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
