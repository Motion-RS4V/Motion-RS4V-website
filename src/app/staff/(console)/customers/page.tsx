import Link from "next/link";
import styles from "@/components/owner/Owner.module.css";
import { formatRupees } from "@/lib/format";
import { shortDate } from "@/lib/venue-time";
import { utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { CUSTOMER_SORTS, listCustomers, type CustomerSort } from "@/server/owner/customers";
import { requestSettings } from "@/server/settings/request";
import { requireOwner } from "@/server/staff/session";

export const metadata = { title: "Customers" };

const SORT_LABELS: Record<CustomerSort, string> = { spend: "Top spend", recent: "Last visit", visits: "Most visits", new: "Newest" };

export default async function CustomersPage(props: PageProps<"/staff/customers">) {
  await requireOwner();
  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const sort = CUSTOMER_SORTS.includes(params.sort as CustomerSort) ? (params.sort as CustomerSort) : "spend";
  const consent = params.consent === "1";
  const page = Math.max(1, Number(params.page) || 1);

  const [result, settings] = await Promise.all([listCustomers(db, { search: q, sort, consentOnly: consent, page }), requestSettings()]);
  const tz = settings.venue.timezone;
  const day = (d: Date | null) => {
    if (!d) return "—";
    const local = utcToLocal(d, tz).date;
    return `${shortDate(local).label} ${local.slice(2, 4)}`;
  };
  const href = (patch: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged = { q, sort, consent: consent ? "1" : null, page: null as number | null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "" && !(k === "sort" && v === "spend")) next.set(k, String(v));
    const s = next.toString();
    return `/staff/customers${s ? `?${s}` : ""}`;
  };
  const exportHref = (consentOnly: boolean) => {
    const p = new URLSearchParams({ sort });
    if (q) p.set("q", q);
    if (consentOnly) p.set("consent", "1");
    return `/api/owner/customers/export?${p}`;
  };
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <span className="tel tel-o">Owner</span>
          <h1>Customers</h1>
          <p className={styles.note}>Spend is money kept after refunds. A visit is a booking that checked in.</p>
        </div>
        <div className={styles.actions}>
          <a className="btn btn-ghost btn-sm" href={exportHref(false)}>
            Export CSV
          </a>
          <a className="btn btn-ghost btn-sm" href={exportHref(true)} title="Only customers who agreed to marketing messages">
            Export marketing list
          </a>
        </div>
      </header>

      <form className={styles.searchBar} action="/staff/customers" role="search">
        <label>
          <span>Search</span>
          <input name="q" defaultValue={q} placeholder="Name, phone or email" />
        </label>
        {sort !== "spend" && <input type="hidden" name="sort" value={sort} />}
        <label className={styles.check}>
          <input type="checkbox" name="consent" value="1" defaultChecked={consent} />
          Marketing consent only
        </label>
        <span className={styles.actions}>
          <button className="btn btn-primary btn-sm" type="submit">
            Search
          </button>
          {(q || consent) && (
            <Link className="btn btn-ghost btn-sm" href={href({ q: "", consent: null })}>
              Clear
            </Link>
          )}
        </span>
      </form>

      <nav className={styles.chips} aria-label="Sort customers">
        {CUSTOMER_SORTS.map((s) => (
          <Link key={s} href={href({ sort: s })} aria-current={s === sort ? "true" : undefined}>
            {SORT_LABELS[s]}
          </Link>
        ))}
      </nav>

      <p className={styles.muted}>
        {result.total.toLocaleString("en-IN")} {result.total === 1 ? "customer" : "customers"}
        {q ? ` matching “${q}”` : ""}
      </p>

      {result.rows.length === 0 ? (
        <p className={styles.note}>No customers found.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col" className={styles.num}>
                  Spend
                </th>
                <th scope="col" className={styles.num}>
                  Visits
                </th>
                <th scope="col" className={styles.num}>
                  No-shows
                </th>
                <th scope="col">Last visit</th>
                <th scope="col">Next session</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b> {c.marketingConsent && <span className={styles.badge} data-tone="good" title="Agreed to marketing">Opt-in</span>}
                    <div className={styles.meta}>{c.phone}</div>
                    {c.email && <div className={styles.meta}>{c.email}</div>}
                  </td>
                  <td className={styles.num}>{formatRupees(c.spendPaise)}</td>
                  <td className={styles.num}>
                    {c.visits}
                    <div className={styles.meta}>of {c.bookings} booked</div>
                  </td>
                  <td className={styles.num}>{c.noShows || "—"}</td>
                  <td>{day(c.lastVisit)}</td>
                  <td>{day(c.nextSession)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className={styles.pager} aria-label="Pages">
          {result.page > 1 ? (
            <Link className="btn btn-ghost btn-sm" href={href({ page: result.page - 1 })}>
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className={styles.meta}>
            Page {result.page} of {pages}
          </span>
          {result.page < pages ? (
            <Link className="btn btn-ghost btn-sm" href={href({ page: result.page + 1 })}>
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
