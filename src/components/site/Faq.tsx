import { formatRupees } from "@/lib/format";
import type { SiteContent } from "@/lib/public-types";
import styles from "./Faq.module.css";

export function Faq({ content }: { content: SiteContent }) {
  const names = content.experiences.map((e) => `${e.name} on the ${e.trackLabel.toLowerCase()}`);
  const items = [
    {
      q: "Is it really a real car?",
      a: "Yes. Every rig controls a physical RC car on a built circuit on the same floor. What you see is a live camera on that car, not a game engine.",
    },
    {
      q: "Headset or screen?",
      a: "Your choice. Every rig has a VR headset and a screen. Pick whichever you like when staff seat you, and switch if one isn't working for you.",
    },
    {
      q: "Do I need any driving experience?",
      a: "None. Staff run a quick controls check before you start, and the cars are built to take a knock.",
    },
    {
      q: "Can I choose which car I drive?",
      a: `You choose the experience${names.length ? `: ${names.join(", or ")}` : ""}. Staff assign a car set up for that track when you arrive, based on what's ready, so a specific car can't be reserved.`,
    },
    {
      q: "Who can drive?",
      a: `Anyone aged ${content.minAgeYears} or over and at least ${content.minHeightCm} cm tall, so they can reach the pedals and sit safely in the rig.`,
    },
    {
      q: "How long do I actually drive?",
      a: `${content.driveMinutes} minutes behind the wheel. Arrive ${content.arriveEarlyMinutes} minutes early so staff can get you set up. Sessions start on time, so arriving late shortens your drive.`,
    },
    {
      q: "Can my friends and I race each other?",
      a: `Yes. Book up to ${content.maxSeatsPerBooking} drivers in the same session, and mix tracks if you like. Everyone gets their own rig and car.`,
    },
    {
      q: "How much does it cost, and how do I pay?",
      a: `${content.hasPriceRules ? "From " : ""}${formatRupees(content.basePricePaise)} per person. ${
        content.onlineBookingEnabled ? "Pay online by UPI, card or wallet when you book. Walk-ins pay at the desk." : "Book on WhatsApp or at the desk, and pay at the venue."
      }`,
    },
    {
      q: "Can I cancel or change my booking?",
      a: `Cancel up to ${content.freeCancelHours} hours before your session for a full refund. After that there's no refund, but you can move your booking to another time once. If we have to cancel, you get a full refund or a new time.`,
    },
  ];

  return (
    <section className={`section ${styles.section}`} id="faq">
      <div className="wrap">
        <div className={styles.grid}>
          <div className={`head ${styles.head}`}>
            <span className="tel tel-o">FAQ</span>
            <h2>Before you drive.</h2>
            <p>Anything else, ask at the desk or message us.</p>
          </div>
          <div className={styles.list}>
            {items.map((item, i) => (
              <details key={item.q} open={i === 0}>
                <summary>
                  {item.q}
                  <span className={styles.plus} aria-hidden="true" />
                </summary>
                <p className={styles.answer}>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
