import { BoardView } from "@/components/staff/BoardView";
import { isLocalDate, utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";
import { getDayBoard } from "@/server/staff/board";

export default async function StaffBoardPage(props: PageProps<"/staff">) {
  const params = await props.searchParams;
  const settings = await loadSettings(db);
  const today = utcToLocal(new Date(), settings.venue.timezone).date;
  const date = typeof params.date === "string" && isLocalDate(params.date) ? params.date : today;
  const board = await getDayBoard(db, date);

  return <BoardView board={board} today={today} />;
}
