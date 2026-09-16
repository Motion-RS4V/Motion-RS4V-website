import { notFound } from "next/navigation";
import { StaffBookingView } from "@/components/staff/StaffBookingView";
import { db } from "@/server/db";
import { getStaffBooking } from "@/server/staff/board";

export default async function StaffBookingPage(props: PageProps<"/staff/booking/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const booking = await getStaffBooking(db, id).catch(() => null);
  if (!booking) notFound();
  return <StaffBookingView booking={booking} />;
}
