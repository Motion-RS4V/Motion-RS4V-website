import { TeamView } from "@/components/owner/TeamView";
import { sessionLabels } from "@/server/booking";
import { db } from "@/server/db";
import { listStaff } from "@/server/owner/staff-accounts";
import { requestSettings } from "@/server/settings/request";
import { requireOwner } from "@/server/staff/session";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await requireOwner();
  const [accounts, settings] = await Promise.all([listStaff(db), requestSettings()]);
  const tz = settings.venue.timezone;

  return (
    <TeamView
      selfId={session.id}
      accounts={accounts.map((a) => {
        const when = a.lastLoginAt ? sessionLabels(a.lastLoginAt, a.lastLoginAt, tz) : null;
        return { id: a.id, email: a.email, name: a.name, role: a.role, active: a.active, lastLogin: when ? `${when.dateLabel}, ${when.timeLabel.split(" – ")[0]}` : null };
      })}
    />
  );
}
