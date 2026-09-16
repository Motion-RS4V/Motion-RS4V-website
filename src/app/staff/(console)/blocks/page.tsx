import { BlocksView } from "@/components/staff/BlocksView";
import { sessionLabels, utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { requestSettings } from "@/server/settings/request";

export default async function BlocksPage() {
  const settings = await requestSettings();
  const tz = settings.venue.timezone;
  const now = new Date();

  const [blocks, rigs] = await Promise.all([
    db.slotBlock.findMany({
      where: { liftedAt: null, endsAt: { gt: new Date(now.getTime() - 24 * 60 * 60_000) } },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, endsAt: true, reason: true, rig: { select: { label: true } }, createdBy: { select: { name: true } } },
    }),
    db.rig.findMany({ where: { status: { not: "RETIRED" } }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
  ]);

  return (
    <BlocksView
      timezone={tz}
      today={utcToLocal(now, tz).date}
      rigs={rigs}
      blocks={blocks.map((b) => ({
        id: b.id,
        reason: b.reason,
        rig: b.rig?.label ?? null,
        createdBy: b.createdBy?.name ?? null,
        ...sessionLabels(b.startsAt, b.endsAt, tz),
        endLabel: utcToLocal(b.endsAt, tz).time,
        startLabel: utcToLocal(b.startsAt, tz).time,
        startDate: utcToLocal(b.startsAt, tz).date,
      }))}
    />
  );
}
