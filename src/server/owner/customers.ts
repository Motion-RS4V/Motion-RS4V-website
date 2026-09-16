import "server-only";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

export const CUSTOMER_SORTS = ["spend", "recent", "visits", "new"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  marketingConsent: boolean;
  createdAt: Date;
  bookings: number;
  visits: number;
  noShows: number;
  spendPaise: number;
  lastVisit: Date | null;
  nextSession: Date | null;
};

const ORDER: Record<CustomerSort, Prisma.Sql> = {
  spend: Prisma.sql`spend_paise desc, last_visit desc nulls last`,
  recent: Prisma.sql`last_visit desc nulls last, spend_paise desc`,
  visits: Prisma.sql`visits desc, spend_paise desc`,
  new: Prisma.sql`c.created_at desc`,
};

type RawRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  marketing_consent: boolean;
  created_at: Date;
  bookings: bigint;
  visits: bigint;
  no_shows: bigint;
  spend_paise: bigint;
  last_visit: Date | null;
  next_session: Date | null;
  total: bigint;
};

/**
 * Customers with totals derived from bookings and payments, never stored, so they can't drift.
 * Spend is money actually kept: captured payments minus every refund that hasn't failed (issued, or owed at the desk).
 */
export async function listCustomers(
  db: PrismaClient,
  input: { search?: string; sort?: CustomerSort; consentOnly?: boolean; page?: number; pageSize?: number; now?: Date },
): Promise<{ rows: CustomerRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = input.pageSize ?? 50;
  const page = Math.max(1, input.page ?? 1);
  const now = input.now ?? new Date();
  const search = input.search?.trim();
  const digits = search?.replace(/\D/g, "");

  const filters: Prisma.Sql[] = [Prisma.sql`c.anonymized_at is null`];
  if (input.consentOnly) filters.push(Prisma.sql`c.marketing_consent = true`);
  if (search) {
    const like = `%${search}%`;
    const phoneMatch = digits && digits.length >= 4 ? Prisma.sql` or c.phone like ${`%${digits}%`}` : Prisma.empty;
    filters.push(Prisma.sql`(c.name ilike ${like} or c.email ilike ${like}${phoneMatch})`);
  }

  const rows = await db.$queryRaw<RawRow[]>`
    with money as (
      select b.customer_id,
             coalesce(sum(p.amount_paise), 0) - coalesce(sum(r.refunded), 0) as spend_paise
      from bookings b
      join payments p on p.booking_id = b.id and p.status in ('CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED')
      left join (select payment_id, sum(amount_paise) as refunded from refunds where status <> 'FAILED' group by payment_id) r on r.payment_id = p.id
      group by b.customer_id
    ),
    visits as (
      select customer_id,
             count(*) filter (where status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW')) as bookings,
             count(*) filter (where status in ('CHECKED_IN', 'COMPLETED')) as visits,
             count(*) filter (where status = 'NO_SHOW') as no_shows,
             max(slot_start) filter (where status in ('CHECKED_IN', 'COMPLETED')) as last_visit,
             min(slot_start) filter (where status = 'CONFIRMED' and slot_start > ${now}) as next_session
      from bookings
      group by customer_id
    )
    select c.id, c.name, c.phone, c.email, c.marketing_consent, c.created_at,
           coalesce(v.bookings, 0) as bookings, coalesce(v.visits, 0) as visits, coalesce(v.no_shows, 0) as no_shows,
           coalesce(m.spend_paise, 0) as spend_paise, v.last_visit, v.next_session,
           count(*) over () as total
    from customers c
    left join visits v on v.customer_id = c.id
    left join money m on m.customer_id = c.id
    where ${Prisma.join(filters, " and ")}
    order by ${ORDER[input.sort ?? "spend"]}
    limit ${pageSize} offset ${(page - 1) * pageSize}`;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      marketingConsent: r.marketing_consent,
      createdAt: r.created_at,
      bookings: Number(r.bookings),
      visits: Number(r.visits),
      noShows: Number(r.no_shows),
      spendPaise: Number(r.spend_paise),
      lastVisit: r.last_visit,
      nextSession: r.next_session,
    })),
    total: Number(rows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

/** Quotes a CSV cell and neutralises spreadsheet formulas (a name like "=HYPERLINK(...)"). */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // A bare "+9198…" phone number is data, not a formula; anything else starting with these characters is neutralised.
  if (/^[=+\-@\t\r]/.test(text) && !/^\+\d+$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) || text !== String(value) ? `"${text.replace(/"/g, '""')}"` : text;
}
