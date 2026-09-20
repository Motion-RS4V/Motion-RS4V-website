import { KioskFlow } from "@/components/kiosk/KioskFlow";
import { KioskNotice } from "@/components/kiosk/KioskNotice";
import { utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { currentKioskDevice } from "@/server/kiosk/devices";
import { requestSettings } from "@/server/settings/request";
import { sellableSlots } from "@/server/staff/board";

// The screen is always showing "now": never serve it from a cache.
export const dynamic = "force-dynamic";

export default async function KioskPage(props: PageProps<"/kiosk">) {
  const { pairing } = await props.searchParams;
  const [device, settings] = await Promise.all([currentKioskDevice(db), requestSettings()]);

  if (!device) {
    return (
      <KioskNotice
        title="This screen isn't set up yet."
        body={
          pairing === "failed"
            ? "That setup link didn't work. It may have already been used or expired. Staff can create a new one from the console."
            : "Staff: open Console → Kiosk and create a setup link for this screen."
        }
      />
    );
  }

  if (!settings.kiosk.enabled) {
    return <KioskNotice title="Please book at the desk." body="Booking on this screen is switched off right now. The team at the counter will sort you out." />;
  }

  const now = new Date();
  const date = utcToLocal(now, settings.venue.timezone).date;
  const [slots, experiences] = await Promise.all([
    sellableSlots(db, date, now, "KIOSK"),
    db.experience.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true, trackLabel: true, tagline: true } }),
  ]);

  if (slots.length === 0) {
    return <KioskNotice title="No sessions left today." body="Today's drives are done. Ask at the desk about tomorrow." />;
  }

  return (
    <KioskFlow
      slots={slots}
      experiences={experiences}
      maxSeats={settings.policy.maxSeatsPerBooking}
      idleResetSeconds={settings.kiosk.idleResetSeconds}
      driveMinutes={settings.schedule.driveMinutes}
      arriveEarlyMinutes={settings.schedule.arriveEarlyMinutes}
      minAgeYears={settings.eligibility.minAgeYears}
      minHeightCm={settings.eligibility.minHeightCm}
    />
  );
}
