import { EligibilitySettings } from "@/components/owner/EligibilitySettings";
import { HoursSettings } from "@/components/owner/HoursSettings";
import { KioskSettings } from "@/components/owner/KioskSettings";
import { PolicySettings } from "@/components/owner/PolicySettings";
import { PricingSettings } from "@/components/owner/PricingSettings";
import { VenueSettings } from "@/components/owner/VenueSettings";
import styles from "@/components/owner/Settings.module.css";
import { requestSettings } from "@/server/settings/request";
import { requireOwner } from "@/server/staff/session";

export const metadata = { title: "Settings" };

const SECTIONS = [
  { href: "#pricing", label: "Prices" },
  { href: "#hours", label: "Hours" },
  { href: "#policy", label: "Booking rules" },
  { href: "#kiosk", label: "Kiosk" },
  { href: "#eligibility", label: "Who can drive" },
  { href: "#venue", label: "Venue" },
];

export default async function SettingsPage() {
  // Checked here, not only in a layout: layouts and pages render in parallel.
  await requireOwner();
  const settings = await requestSettings();

  return (
    <div className={styles.page}>
      <header>
        <span className="tel tel-o">Owner</span>
        <h1>Settings</h1>
        <p className={styles.note}>Each section saves on its own. Changes reach the website and new bookings straight away.</p>
      </header>
      <nav className={styles.jump} aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <a key={s.href} href={s.href}>
            {s.label}
          </a>
        ))}
      </nav>

      <PricingSettings initial={settings.pricing} />
      <HoursSettings initial={settings.schedule} />
      <PolicySettings initial={settings.policy} />
      <KioskSettings initial={settings.kiosk} />
      <EligibilitySettings initial={settings.eligibility} />
      <VenueSettings initial={settings.venue} />
    </div>
  );
}
