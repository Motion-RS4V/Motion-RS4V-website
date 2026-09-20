import { KioskDevices } from "@/components/owner/KioskDevices";
import { sessionLabels } from "@/server/booking";
import { db } from "@/server/db";
import { listKioskDevices } from "@/server/kiosk/devices";
import { requestSettings } from "@/server/settings/request";
import { requireOwner } from "@/server/staff/session";

export const metadata = { title: "Kiosk screens" };

export default async function KioskDevicesPage() {
  await requireOwner();
  const [devices, settings] = await Promise.all([listKioskDevices(db), requestSettings()]);
  const tz = settings.venue.timezone;

  return (
    <KioskDevices
      kioskOn={settings.kiosk.enabled}
      devices={devices.map((d) => {
        const when = d.lastSeenAt ? sessionLabels(d.lastSeenAt, d.lastSeenAt, tz) : null;
        return {
          id: d.id,
          label: d.label,
          pairedBy: d.pairedBy?.name ?? null,
          lastSeen: when ? `${when.dateLabel}, ${when.timeLabel.split(" – ")[0]}` : null,
          revoked: d.revokedAt !== null,
          paired: d.paired,
        };
      })}
    />
  );
}
