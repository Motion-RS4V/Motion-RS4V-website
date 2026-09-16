import { WalkInForm } from "@/components/staff/WalkInForm";
import { isLocalDate, utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { requestSettings } from "@/server/settings/request";
import { sellableSlots } from "@/server/staff/board";

export default async function SellSeatPage(props: PageProps<"/staff/sell">) {
  const params = await props.searchParams;
  const settings = await requestSettings();
  const tz = settings.venue.timezone;
  const start = typeof params.start === "string" ? new Date(params.start) : null;
  const startValid = start && !Number.isNaN(start.getTime());

  const date =
    typeof params.date === "string" && isLocalDate(params.date)
      ? params.date
      : startValid
        ? utcToLocal(start, tz).date
        : utcToLocal(new Date(), tz).date;

  const [slots, experiences] = await Promise.all([
    sellableSlots(db, date),
    db.experience.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true, trackLabel: true } }),
  ]);

  return (
    <WalkInForm
      date={date}
      timezone={tz}
      slots={slots}
      experiences={experiences}
      maxSeats={settings.policy.maxSeatsPerBooking}
      preselectedStart={startValid ? start.toISOString() : null}
    />
  );
}
