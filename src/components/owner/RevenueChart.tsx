"use client";

import { useState } from "react";
import { formatRupees } from "@/lib/format";
import { shortDate } from "@/lib/venue-time";
import styles from "./Dashboard.module.css";

type Day = { date: string; onlinePaise: number; deskPaise: number; refundedPaise: number; netPaise: number };

/** Round a maximum up to a clean axis value: 1 / 2 / 2.5 / 5 × a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * power) return step * power;
  return 10 * power;
}

function compactRupees(paise: number): string {
  const r = paise / 100;
  if (r >= 100_000) return `₹${(r / 100_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L`;
  if (r >= 1_000) return `₹${(r / 1_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}K`;
  return `₹${r.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Money collected per day, stacked online (bottom) + desk. Refunds are listed in the tooltip and table rather than drawn
 * below zero, so the chart keeps a single baseline.
 */
export function RevenueChart({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const max = niceMax(Math.max(...days.map((d) => d.onlinePaise + d.deskPaise), 0));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(days.length / 8);
  const hovered = active !== null ? days[active] : null;

  return (
    <div className={styles.chart}>
      <div className={styles.legend}>
        <span>
          <i className={styles.swatch} style={{ background: "var(--viz-online)" }} /> Online
        </span>
        <span>
          <i className={styles.swatch} style={{ background: "var(--viz-desk)" }} /> Desk (cash, UPI, card)
        </span>
        <button type="button" className={styles.tableToggle} aria-pressed={showTable} onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Online</th>
                <th scope="col">Desk</th>
                <th scope="col">Refunds</th>
                <th scope="col">Net</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{shortDate(d.date).label}</td>
                  <td>{formatRupees(d.onlinePaise)}</td>
                  <td>{formatRupees(d.deskPaise)}</td>
                  <td>{d.refundedPaise ? `−${formatRupees(d.refundedPaise)}` : "—"}</td>
                  <td>{formatRupees(d.netPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.plot} onPointerLeave={() => setActive(null)}>
          <div className={styles.yAxis} aria-hidden>
            {[...ticks].reverse().map((t) => (
              <span key={t}>{compactRupees(t)}</span>
            ))}
          </div>
          <div className={styles.columns} role="list" aria-label="Revenue per day">
            {ticks.map((t) => (
              <i key={t} className={styles.grid} style={{ bottom: `${(t / max) * 100}%` }} aria-hidden />
            ))}
            {days.map((d, i) => {
              const total = d.onlinePaise + d.deskPaise;
              return (
                <div
                  key={d.date}
                  role="listitem"
                  tabIndex={0}
                  className={styles.column}
                  data-active={active === i || undefined}
                  aria-label={`${shortDate(d.date).label}: online ${formatRupees(d.onlinePaise)}, desk ${formatRupees(d.deskPaise)}, refunds ${formatRupees(d.refundedPaise)}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <div className={styles.stack} style={{ height: `${(total / max) * 100}%` }}>
                    {d.deskPaise > 0 && <span className={styles.segDesk} style={{ flexGrow: d.deskPaise }} />}
                    {d.onlinePaise > 0 && <span className={styles.segOnline} style={{ flexGrow: d.onlinePaise }} />}
                  </div>
                  <span className={styles.xLabel} aria-hidden>
                    {i % labelEvery === 0 ? shortDate(d.date).day : ""}
                  </span>
                </div>
              );
            })}
            {hovered && (
              <div className={styles.tooltip} style={{ left: `${((active! + 0.5) / days.length) * 100}%` }} role="status">
                <b>{shortDate(hovered.date).label}</b>
                <span>
                  <i style={{ background: "var(--viz-online)" }} />
                  <strong>{formatRupees(hovered.onlinePaise)}</strong> online
                </span>
                <span>
                  <i style={{ background: "var(--viz-desk)" }} />
                  <strong>{formatRupees(hovered.deskPaise)}</strong> desk
                </span>
                {hovered.refundedPaise > 0 && (
                  <span>
                    <strong>−{formatRupees(hovered.refundedPaise)}</strong> refunds
                  </span>
                )}
                <span className={styles.tooltipTotal}>
                  <strong>{formatRupees(hovered.netPaise)}</strong> net
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
