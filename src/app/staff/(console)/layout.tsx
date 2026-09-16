import { IdleSignOut } from "@/components/staff/IdleSignOut";
import { StaffNav } from "@/components/staff/StaffNav";
import { requireStaff } from "@/server/staff/session";

export const metadata = { title: "Venue console", robots: { index: false, follow: false } };

export default async function ConsoleLayout({ children }: LayoutProps<"/staff">) {
  const session = await requireStaff();
  return (
    <>
      <IdleSignOut />
      <StaffNav name={session.name} role={session.role} />
      <main className="staff-main">{children}</main>
    </>
  );
}
