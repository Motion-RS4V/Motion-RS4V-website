import { SpecialDatesView } from "@/components/owner/SpecialDatesView";
import { utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { listOverrides } from "@/server/owner/overrides";
import { requestSettings } from "@/server/settings/request";
import { requireOwner } from "@/server/staff/session";

export const metadata = { title: "Special dates" };

export default async function SpecialDatesPage() {
  await requireOwner();
  const settings = await requestSettings();
  const today = utcToLocal(new Date(), settings.venue.timezone).date;
  return <SpecialDatesView overrides={await listOverrides(db, today)} today={today} />;
}
