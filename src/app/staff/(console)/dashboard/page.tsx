import Link from "next/link";
import { OccupancyHeatmap } from "@/components/owner/OccupancyHeatmap";
import { RevenueChart } from "@/components/owner/RevenueChart";
import dash from "@/components/owner/Dashboard.module.css";
import styles from "@/components/owner/Owner.module.css";
import { formatRupees } from "@/lib/format";
import { shortDate } from "@/lib/venue-time";
import { addDays, isLocalDate, utcToLocal } from "@/server/booking";
import { db } from "@/server/db";
import { daysInRange } from "@/server/owner/analytics";
import { getDashboard, type Kpi } from "@/server/owner/dashboard";
import { requestSettings } from "@/server/settings/request";
import { paymentGateway, syncPendingRefunds } from "@/server/payments";
import { requireOwner } from "@/server/staff/session";

export const metadata = { title: "Dashboard" };

const PRESETS = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];
const MAX_DAYS = 366;
const CHANNEL_LABEL: Record<string, string> = { ONLINE: "Online", WALK_IN: "Walk-in", PHONE: "Phone", KIOSK: "Kiosk" };

const pct = (n: number) => (n > 0 && n < 0.005 ? "<1%" : `${Math.round(n * 100)}%`);

function Delta({ kpi, upIsGood = true, format }: { kpi: Kpi; upIsGood?: boolean; format: (n: number) => string }) {
  if (kpi.change === null) return <span className={dash.delta}>No earlier data to compare</span>;
  const rounded = Math.round(kpi.change * 100);
  const good = rounded === 0 ? undefined : rounded > 0 === upIsGood;
  return (
    <span className={dash.delta} data-good={good === undefined ? undefined : String(good)}>
      <b>
        {rounded > 0 ? "▲ +" : rounded < 0 ? "▼ " : ""}
        {rounded}%
      </b>{" "}
      vs {format(kpi.previous)} before
    </span>
  );
}

function BarList({ items }: { items: { name: string; value: number; label: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <p className={dash.empty}>Nothing yet in this range.</p>;
  return (
    <ul className={dash.bars}>
      {items.map((i) => (
        <li key={i.name}>
          <span className={dash.barName} title={i.name}>
            {i.name}
          </span>
          <span className={dash.barTrack} aria-hidden>
            <span className={dash.barFill} style={{ display: "block", width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className={dash.barValue}>{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage(props: PageProps<"/staff/dashboard">) {
  const [, params, settings] = await Promise.all([requireOwner(), props.searchParams, requestSettings()]);
  const today = utcToLocal(new Date(), settings.venue.timezone).date;

  const preset = PRESETS.find((p) => p.key === params.range) ?? (params.from || params.to ? null : PRESETS[1]);
  let from = preset ? addDays(today, -(preset.days - 1)) : typeof params.from === "string" && isLocalDate(params.from) ? params.from : addDays(today, -29);
  let to = preset ? today : typeof params.to === "string" && isLocalDate(params.to) ? params.to : today;
  if (from > to) [from, to] = [to, from];
  if (daysInRange(from, to) > MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));

  // Catch up on online refunds Razorpay has finished, alongside loading the numbers. Pending and processed refunds
  // count the same in the totals, so running both at once only affects the "still processing" note.
  const [d] = await Promise.all([
    getDashboard(db, { from, to }),
    Promise.race([syncPendingRefunds(db, paymentGateway(), { limit: 20 }).catch((err) => console.error("refund sync failed", err)), new Promise((r) => setTimeout(r, 4000))]),
  ]);
  const rangeLabel = `${shortDate(d.from).label} – ${shortDate(d.to).label} ${d.to.slice(0, 4)}`;
  const seatTotal = d.seats.byChannel.reduce((t, c) => t + c.seats, 0);

  return (
    <div className={`${styles.page} ${dash.root}`}>
      <header className={styles.head}>
        <div>
          <span className="tel tel-o">Owner</span>
          <h1>Dashboard</h1>
          <p className={styles.note}>{rangeLabel}. Changes compare with the same number of days just before.</p>
        </div>
      </header>

      <div className={dash.filters}>
        <nav className={styles.chips} aria-label="Date range">
          {PRESETS.map((p) => (
            <Link key={p.key} href={`/staff/dashboard?range=${p.key}`} aria-current={preset?.key === p.key ? "true" : undefined}>
              {p.label}
            </Link>
          ))}
        </nav>
        <form className={dash.custom} action="/staff/dashboard">
          <label>
            <span>From</span>
            <input type="date" name="from" defaultValue={from} max={today} />
          </label>
          <label>
            <span>To</span>
            <input type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn btn-ghost btn-sm" type="submit" aria-current={!preset ? "true" : undefined}>
            Apply
          </button>
        </form>
      </div>

      <section className={dash.tiles} aria-label="Headline numbers">
        <div className={dash.tile} data-hero>
          <span className={dash.tileLabel}>Net revenue</span>
          <span className={dash.tileValue}>{formatRupees(d.kpis.netRevenuePaise.value)}</span>
          <Delta kpi={d.kpis.netRevenuePaise} format={formatRupees} />
        </div>
        <div className={dash.tile}>
          <span className={dash.tileLabel}>Seats sold</span>
          <span className={dash.tileValue}>{d.kpis.seatsSold.value.toLocaleString("en-IN")}</span>
          <Delta kpi={d.kpis.seatsSold} format={(n) => n.toLocaleString("en-IN")} />
        </div>
        <div className={dash.tile}>
          <span className={dash.tileLabel}>Occupancy</span>
          <span className={dash.tileValue}>{pct(d.kpis.occupancy.value)}</span>
          <Delta kpi={d.kpis.occupancy} format={pct} />
        </div>
        <div className={dash.tile}>
          <span className={dash.tileLabel}>Bookings</span>
          <span className={dash.tileValue}>{d.kpis.bookings.value.toLocaleString("en-IN")}</span>
          <Delta kpi={d.kpis.bookings} format={(n) => n.toLocaleString("en-IN")} />
        </div>
        <div className={dash.tile}>
          <span className={dash.tileLabel}>Average group</span>
          <span className={dash.tileValue}>{d.kpis.averageGroup.value.toFixed(1)}</span>
          <Delta kpi={d.kpis.averageGroup} format={(n) => n.toFixed(1)} />
        </div>
        <div className={dash.tile}>
          <span className={dash.tileLabel}>No-show rate</span>
          <span className={dash.tileValue}>{pct(d.kpis.noShowRate.value)}</span>
          <Delta kpi={d.kpis.noShowRate} upIsGood={false} format={pct} />
        </div>
      </section>

      <section className={styles.card}>
        <h2>Money in</h2>
        <dl className={dash.money}>
          <div className={dash.moneyItem}>
            <dt>Collected</dt>
            <dd className={dash.moneyValue}>{formatRupees(d.revenue.collectedPaise)}</dd>
            <dd className={dash.moneyNote}>
              <i className={dash.swatch} style={{ background: "var(--viz-online)" }} /> {formatRupees(d.revenue.onlinePaise)} online
              <br />
              <i className={dash.swatch} style={{ background: "var(--viz-desk)" }} /> {formatRupees(d.revenue.deskPaise)} at the desk
            </dd>
          </div>
          <div className={dash.moneyItem} data-tone="refund">
            <dt>Refunded</dt>
            <dd className={dash.moneyValue}>
              {d.revenue.refundedPaise > 0 ? "−" : ""}
              {formatRupees(d.revenue.refundedPaise)}
            </dd>
            <dd className={dash.moneyNote}>
              {d.revenue.refundPendingPaise > 0
                ? `${formatRupees(d.revenue.refundPendingPaise)} still processing at Razorpay`
                : d.revenue.refundedPaise > 0
                  ? "All paid out"
                  : "No refunds in this range"}
            </dd>
          </div>
        </dl>
        <RevenueChart days={d.revenue.days} />
        <p className={styles.muted}>
          Counted on the day the money moved, not the day of the session. Online refunds count on the day they were issued; desk refunds when the cash was handed back.
        </p>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h2>Busiest times</h2>
          <span className={styles.meta}>
            {d.seats.sold} of {d.seats.capacity} seats · {d.rigs} working rigs
          </span>
        </div>
        <OccupancyHeatmap cells={d.seats.heat} hours={d.seats.hours} />
        <p className={styles.muted}>Share of seats sold in sessions starting in each hour. Uses today&apos;s working rig count for every day in the range.</p>
      </section>

      <div className={dash.two}>
        <section className={styles.card}>
          <h2>Tracks</h2>
          <BarList
            items={d.seats.byExperience.map((e) => ({
              name: d.experiences[e.code] ?? e.code,
              value: e.seats,
              label: `${e.seats} · ${pct(d.seats.sold ? e.seats / d.seats.sold : 0)}`,
            }))}
          />
        </section>
        <section className={styles.card}>
          <h2>How seats were sold</h2>
          <BarList
            items={d.seats.byChannel.map((c) => ({
              name: CHANNEL_LABEL[c.channel] ?? c.channel,
              value: c.seats,
              label: `${c.seats} · ${pct(seatTotal ? c.seats / seatTotal : 0)}`,
            }))}
          />
        </section>
        <section className={styles.card}>
          <h2>Where online bookings came from</h2>
          <BarList items={d.sources.map((s) => ({ name: s.source, value: s.bookings, label: String(s.bookings) }))} />
          <p className={styles.muted}>From the link&apos;s utm_source tag, else the referring website.</p>
        </section>
        <section className={styles.card}>
          <h2>Bookings</h2>
          <dl className={dash.facts}>
            <div>
              <dt>New customers</dt>
              <dd>{d.bookings.newCustomers}</dd>
            </div>
            <div>
              <dt>Returning customers</dt>
              <dd>{d.bookings.returningCustomers}</dd>
            </div>
            <div>
              <dt>Cancelled bookings</dt>
              <dd>
                {d.bookings.cancelled} of {d.bookings.total}
              </dd>
            </div>
            <div>
              <dt>Seats checked in</dt>
              <dd>{d.seats.checkedIn}</dd>
            </div>
            <div>
              <dt>No-show seats</dt>
              <dd>{d.seats.noShows}</dd>
            </div>
            <div>
              <dt>Walk-in seats</dt>
              <dd>{d.seats.walkIns}</dd>
            </div>
          </dl>
          <Link className="btn btn-ghost btn-sm" href="/staff/customers" style={{ justifySelf: "start" }}>
            See customers
          </Link>
        </section>
      </div>
    </div>
  );
}
