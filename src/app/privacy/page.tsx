import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import styles from "@/components/legal/Legal.module.css";
import { LINK_VALID_AFTER_SESSION_DAYS } from "@/server/manage/tokens";
import { getPolicyFacts } from "@/server/site/policies";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What personal details Motion RS4V collects when you book, why, who we share them with, how long we keep them and your rights.",
};

export default async function PrivacyPage() {
  const f = await getPolicyFacts();
  const { venue } = f;
  const contact = venue.email ? (
    <a href={`mailto:${venue.email}`}>{venue.email}</a>
  ) : (
    <a href="#contact">the contact details below</a>
  );

  const sections = [
    {
      id: "who",
      title: "Who we are",
      body: (
        <p>
          {venue.name} is operated by <strong>{f.operator}</strong>, which decides how your personal details are used and is responsible for them. This policy
          covers the website, online and phone bookings, and bookings made at the venue. It is written with India&apos;s Digital Personal Data Protection Act,
          2023 in mind.
        </p>
      ),
    },
    {
      id: "collect",
      title: "What we collect",
      body: (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Details</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Your name, mobile number and email address</td>
                <td>When you book, online, by phone or at the desk</td>
              </tr>
              <tr>
                <td>Drivers&apos; names (optional)</td>
                <td>If you add them to a booking</td>
              </tr>
              <tr>
                <td>Your booking: sessions, tracks, check-ins, changes and cancellations</td>
                <td>As you book and visit</td>
              </tr>
              <tr>
                <td>Payment records: amount, status, method and the reference Razorpay gives us</td>
                <td>When you pay or get a refund. We never receive your full card number, CVV or UPI PIN.</td>
              </tr>
              <tr>
                <td>Whether you agreed to marketing messages, and when you accepted our terms</td>
                <td>At checkout</td>
              </tr>
              <tr>
                <td>How you reached the site: the referring website, campaign tags in the link, the first page you landed on, and device type (mobile, tablet or desktop)</td>
                <td>Saved with an online booking</td>
              </tr>
              <tr>
                <td>Your IP address</td>
                <td>Used briefly to stop abuse, such as repeated failed attempts, and deleted within about a day</td>
              </tr>
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: "use",
      title: "Why we use it",
      body: (
        <ul>
          <li>To take and manage your booking: confirming it, checking you in, assigning cars and handling changes, cancellations and refunds.</li>
          <li>To send you service emails, such as your confirmation, booking changes, refunds and the private link to manage your booking.</li>
          <li>To keep accounts and meet tax and legal obligations.</li>
          <li>To prevent fraud and misuse, and keep the booking system secure.</li>
          <li>To understand how the venue is doing, such as busy times and repeat visits, mostly in combined figures.</li>
          <li>
            To send offers and news about new tracks, <strong>only if you ticked the box</strong> to receive them. You can withdraw that consent at any time by
            contacting us at {contact}.
          </li>
        </ul>
      ),
    },
    {
      id: "share",
      title: "Who we share it with",
      body: (
        <>
          <p>We don&apos;t sell your personal details. We share them only with service providers that help us run bookings, under their own security and privacy terms:</p>
          <ul>
            <li>
              <strong>Razorpay</strong> processes online payments and refunds.
            </li>
            <li>
              <strong>Supabase</strong> hosts our booking database, on servers in Mumbai, India.
            </li>
            <li>
              <strong>Resend</strong> delivers our emails.
            </li>
            <li>Our website hosting provider, which serves the site and processes requests to it.</li>
          </ul>
          <p>
            Some of these providers may process data outside India. We may also share details where the law requires it, for example with tax authorities or in
            response to a lawful request.
          </p>
        </>
      ),
    },
    {
      id: "storage",
      title: "Cookies and browser storage",
      body: (
        <>
          <p>
            The public website doesn&apos;t use advertising or tracking cookies. While you browse, it keeps a note of how you arrived (the campaign tags and
            referring site above) in your browser&apos;s session storage, which is cleared when you close the tab, so it can be saved with your booking.
          </p>
          <p>Our staff console uses sign-in cookies, which are only set for venue staff.</p>
        </>
      ),
    },
    {
      id: "keep",
      title: "How long we keep it",
      body: (
        <ul>
          <li>Booking and payment records are kept for as long as tax and accounting law requires.</li>
          <li>
            Links to manage a booking stop working {LINK_VALID_AFTER_SESSION_DAYS} days after the session. We store only a scrambled (hashed) version of each link, so the link itself
            can&apos;t be read from our database.
          </li>
          <li>IP addresses used to stop abuse are deleted within about a day.</li>
          <li>If you ask us to delete your details, we remove or anonymise anything we aren&apos;t legally required to keep.</li>
        </ul>
      ),
    },
    {
      id: "rights",
      title: "Your rights",
      body: (
        <>
          <p>You can ask us to:</p>
          <ul>
            <li>tell you what personal details we hold about you and how we use them;</li>
            <li>correct or update details that are wrong or incomplete;</li>
            <li>delete your details, where we don&apos;t need to keep them by law;</li>
            <li>stop sending marketing messages;</li>
            <li>nominate someone to act for you if you&apos;re unable to.</li>
          </ul>
          <p>
            Contact us at {contact}. We may need to confirm it&apos;s you first, for example by using the mobile number or email on your bookings. If
            you&apos;re not happy with our response, you can complain to the Data Protection Board of India.
          </p>
        </>
      ),
    },
    {
      id: "security",
      title: "Keeping it safe",
      body: (
        <p>
          Your details are sent over encrypted connections and stored with access restricted to signed-in venue staff. Payments are handled entirely by
          Razorpay. No system is perfectly secure; if we become aware of a breach that affects you, we&apos;ll tell you and the authorities as the law requires.
        </p>
      ),
    },
    {
      id: "children",
      title: "Children",
      body: (
        <p>
          Bookings must be made by an adult. Young drivers can take part if they meet our <Link href="/terms#safety">safety requirements</Link>; we only
          collect a driver&apos;s name if the person booking chooses to add it.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to this policy",
      body: <p>We&apos;ll update this page if the way we handle personal details changes, and change the date at the top.</p>,
    },
  ];

  return (
    <LegalPage
      current="/privacy"
      eyebrow="Privacy"
      title="Privacy policy."
      intro={<p>What we collect when you book with {venue.name}, why, who sees it, and how to ask us to change or delete it.</p>}
      sections={sections}
      venue={venue}
      operator={f.operator}
    />
  );
}
