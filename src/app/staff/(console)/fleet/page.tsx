import { FleetView } from "@/components/staff/FleetView";
import { db } from "@/server/db";

export default async function FleetPage() {
  const [rigs, cars] = await Promise.all([
    db.rig.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, label: true, status: true, notes: true } }),
    db.car.findMany({
      orderBy: [{ experience: { sortOrder: "asc" } }, { label: "asc" }],
      select: { id: true, label: true, status: true, experience: { select: { code: true, name: true, trackLabel: true } } },
    }),
  ]);
  return <FleetView rigs={rigs} cars={cars} />;
}
