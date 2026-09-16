import Link from "next/link";
import styles from "@/components/owner/Owner.module.css";
import { shortDate } from "@/lib/venue-time";
import { utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { ACTIVITY_AREAS, listActivity, type ActivityArea } from "@/server/owner/activity";
import { describeActivity } from "@/server/owner/activity-text";
import { requestSettings } from "@/server/settings/request";
import { requireOwner } from "@/server/staff/session";

export const metadata = { title: "Activity" };

export default async function ActivityPage(props: PageProps<"/staff/activity">) {
  await requireOwner();
  const params = await props.searchParams;
  const area = typeof params.area === "string" && params.area in ACTIVITY_AREAS ? (params.area as ActivityArea) : undefined;
  const before = typeof params.before === "string" ? params.before : undefined;

  const [{ entries, nextCursor }, settings] = await Promise.all([listActivity(db, { area, before }), requestSettings()]);
  const tz = settings.venue.timezone;
  const areaHref = (a?: ActivityArea) => (a ? `/staff/activity?area=${a}` : "/staff/activity");

  const rows = entries.map((e, i) => {
    const local = utcToLocal(e.createdAt, tz);
    const previous = i > 0 ? utcToLocal(entries[i - 1].createdAt, tz).date : null;
    return { e, local, heading: local.date !== previous ? `${shortDate(local.date).label} ${local.date.slice(0, 4)}` : null };
  });

  return (
    <div className={styles.page}>
      <header>
        <span className="tel tel-o">Owner</span>
        <h1 className={styles.title}>Activity</h1>
        <p className={styles.note}>Every change made in the console or by the booking system, newest first. The console has no way to edit or delete entries.</p>
      </header>

      <nav className={styles.chips} aria-label="Filter activity">
        <Link href={areaHref()} aria-current={!area ? "true" : undefined}>
          All
        </Link>
        {(Object.keys(ACTIVITY_AREAS) as ActivityArea[]).map((a) => (
          <Link key={a} href={areaHref(a)} aria-current={a === area ? "true" : undefined}>
            {ACTIVITY_AREAS[a].label}
          </Link>
        ))}
      </nav>

      <section className={styles.card}>
        {entries.length === 0 ? (
          <p className={styles.muted}>Nothing recorded yet.</p>
        ) : (
          <ul className={styles.list}>
            {rows.map(({ e, local, heading }) => {
              return (
                <li key={e.id} style={{ display: "contents" }}>
                  {heading && <span className="tel" style={{ marginTop: 8 }}>{heading}</span>}
                  <div className={styles.row}>
                    <span className={styles.rowMain}>
                      <b>{describeActivity(e)}</b>
                      <span className={styles.meta}>
                        {local.time} · {e.actor ?? "System"}
                      </span>
                    </span>
                    {e.entityType === "booking" && e.bookingReference && (
                      <Link className="btn btn-ghost btn-sm" href={`/staff/booking/${e.entityId}`}>
                        Open
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(before || nextCursor) && (
        <nav className={styles.pager} aria-label="Pages">
          {before ? (
            <Link className="btn btn-ghost btn-sm" href={areaHref(area)}>
              ← Newest
            </Link>
          ) : (
            <span />
          )}
          {nextCursor && (
            <Link className="btn btn-ghost btn-sm" href={`${areaHref(area)}${area ? "&" : "?"}before=${nextCursor}`}>
              Older →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
