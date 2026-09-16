"use client";

import { useState } from "react";
import styles from "./Dashboard.module.css";

type Cell = { day: string; hour: number; sold: number; capacity: number; share: number };

const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
/** One blue ramp, dark = empty → light = full, for the dark console surface. */
const RAMP = ["var(--viz-seq-1)", "var(--viz-seq-2)", "var(--viz-seq-3)", "var(--viz-seq-4)"];
const BANDS = ["1–24%", "25–49%", "50–74%", "75–100%"];

function fill(cell: Cell): string {
  if (cell.capacity === 0) return "transparent";
  if (cell.sold === 0) return "var(--well)";
  return RAMP[Math.min(3, Math.floor(cell.share * 4))];
}

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** How full each weekday × hour was. Hours the venue was closed are left blank. */
export function OccupancyHeatmap({ cells, hours }: { cells: Cell[]; hours: number[] }) {
  const [active, setActive] = useState<Cell | null>(null);
  const [showTable, setShowTable] = useState(false);
  const at = (day: string, hour: number) => cells.find((c) => c.day === day && c.hour === hour)!;
  const describe = (c: Cell) =>
    c.capacity === 0 ? `${DAY_LABEL[c.day]} ${hourLabel(c.hour)}: closed` : `${DAY_LABEL[c.day]} ${hourLabel(c.hour)}: ${Math.round(c.share * 100)}% full, ${c.sold} of ${c.capacity} seats`;

  if (hours.length === 0) return <p className={styles.empty}>No opening hours in this range.</p>;

  return (
    <div className={styles.chart}>
      <div className={styles.legend}>
        <span>
          <i className={styles.swatch} style={{ background: "var(--well)" }} /> Empty
        </span>
        {RAMP.map((color, i) => (
          <span key={color}>
            <i className={styles.swatch} style={{ background: color }} /> {BANDS[i]}
          </span>
        ))}
        <button type="button" className={styles.tableToggle} aria-pressed={showTable} onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">Hour</th>
                {DAY_ORDER.map((d) => (
                  <th key={d} scope="col">
                    {DAY_LABEL[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h}>
                  <th scope="row">{hourLabel(h)}</th>
                  {DAY_ORDER.map((d) => {
                    const c = at(d, h);
                    return <td key={d}>{c.capacity ? `${Math.round(c.share * 100)}%` : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.heatWrap} onPointerLeave={() => setActive(null)}>
          <div className={styles.heat} style={{ gridTemplateColumns: `44px repeat(${hours.length}, minmax(22px, 1fr))` }} role="grid" aria-label="Seats sold by weekday and hour">
            <span aria-hidden />
            {hours.map((h, i) => (
              <span key={h} className={styles.heatHour} aria-hidden>
                {i % 2 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
            {DAY_ORDER.map((d) => (
              <div key={d} role="row" style={{ display: "contents" }}>
                <span className={styles.heatDay} role="rowheader">
                  {DAY_LABEL[d]}
                </span>
                {hours.map((h) => {
                  const c = at(d, h);
                  return (
                    <span
                      key={h}
                      role="gridcell"
                      tabIndex={c.capacity ? 0 : -1}
                      aria-label={describe(c)}
                      className={styles.heatCell}
                      data-closed={c.capacity === 0 || undefined}
                      data-active={active === c || undefined}
                      style={{ background: fill(c) }}
                      onPointerEnter={() => setActive(c)}
                      onFocus={() => setActive(c)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <p className={styles.heatReadout} role="status">
            {active ? describe(active) : "Hover or tap a square for the numbers."}
          </p>
        </div>
      )}
    </div>
  );
}
