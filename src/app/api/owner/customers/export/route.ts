import { utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { csvCell, CUSTOMER_SORTS, listCustomers, type CustomerSort } from "@/server/owner/customers";
import { loadSettings } from "@/server/settings";
import { staffApiSession } from "@/server/staff/session";

/** Customer list as CSV. `consent=1` keeps only people who agreed to marketing, which is what a campaign may use. */
export async function GET(request: Request) {
  const auth = await staffApiSession({ owner: true });
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const sortParam = url.searchParams.get("sort");
  const sort = CUSTOMER_SORTS.includes(sortParam as CustomerSort) ? (sortParam as CustomerSort) : "spend";
  const consentOnly = url.searchParams.get("consent") === "1";
  const tz = (await loadSettings(db)).venue.timezone;

  const { rows } = await listCustomers(db, { search: url.searchParams.get("q") ?? undefined, sort, consentOnly, pageSize: 100_000 });
  const day = (d: Date | null) => (d ? utcToLocal(d, tz).date : "");
  const lines = [
    ["Name", "Phone", "Email", "Marketing consent", "Bookings", "Visits", "No-shows", "Spend (INR)", "Last visit", "Next session", "Customer since"].join(","),
    ...rows.map((r) =>
      [r.name, r.phone, r.email, r.marketingConsent ? "yes" : "no", r.bookings, r.visits, r.noShows, (r.spendPaise / 100).toFixed(2), day(r.lastVisit), day(r.nextSession), day(r.createdAt)]
        .map(csvCell)
        .join(","),
    ),
  ];

  await db.auditLog.create({
    data: { actorId: auth.session.id, action: "customers.export", entityType: "customers", entityId: consentOnly ? "consent" : "all", after: { rows: rows.length } },
  });

  const stamp = utcToLocal(new Date(), tz).date;
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rs4v-customers-${consentOnly ? "marketing-" : ""}${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
