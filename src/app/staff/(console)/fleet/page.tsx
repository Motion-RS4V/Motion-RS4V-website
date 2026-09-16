import { FleetAdmin } from "@/components/owner/FleetAdmin";
import { FleetView } from "@/components/staff/FleetView";
import { db } from "@/server/db";
import { getStaffSession } from "@/server/staff/session";

export default async function FleetPage() {
  const [rigs, cars, session, experiences] = await Promise.all([
    db.rig.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true, label: true, status: true, notes: true } }),
    db.car.findMany({
      orderBy: [{ experience: { sortOrder: "asc" } }, { label: "asc" }],
      select: { id: true, label: true, status: true, notes: true, experience: { select: { code: true, name: true, trackLabel: true } } },
    }),
    getStaffSession(),
    db.experience.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true } }),
  ]);
  return (
    <>
      <FleetView rigs={rigs} cars={cars} />
      {session?.role === "OWNER" && (
        <div style={{ marginTop: 14 }}>
          <FleetAdmin rigs={rigs} cars={cars} experiences={experiences} />
        </div>
      )}
    </>
  );
}
