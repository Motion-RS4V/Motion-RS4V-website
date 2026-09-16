"use client";

import { useId } from "react";
import { DAYS, type Day, type DayHours, type Settings } from "@/server/settings/schema";
import { NumberField, SettingsForm, useFieldError } from "./form";
import styles from "./Settings.module.css";

const DAY_NAMES: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const FALLBACK_HOURS = { opensAt: "10:00", closesAt: "22:00" };

function DayRow({ day, hours, onChange }: { day: Day; hours: DayHours; onChange: (hours: DayHours) => void }) {
  const id = useId();
  const closesError = useFieldError(`weeklyHours.${day}.closesAt`);
  const opensError = useFieldError(`weeklyHours.${day}.opensAt`);
  const error = closesError ?? opensError;
  const open = hours !== null;
  return (
    <div className={styles.dayRow} data-invalid={error ? true : undefined}>
      <label className={styles.dayName}>
        <input type="checkbox" checked={open} onChange={(e) => onChange(e.target.checked ? FALLBACK_HOURS : null)} />
        <b>{DAY_NAMES[day]}</b>
      </label>
      {open ? (
        <span className={styles.dayTimes}>
          <input aria-label={`${DAY_NAMES[day]} opens`} id={`${id}-o`} type="time" step={300} value={hours.opensAt} onChange={(e) => onChange({ ...hours, opensAt: e.target.value })} />
          <span>to</span>
          <input aria-label={`${DAY_NAMES[day]} closes`} type="time" step={300} value={hours.closesAt} onChange={(e) => onChange({ ...hours, closesAt: e.target.value })} />
        </span>
      ) : (
        <span className={styles.closed}>Closed</span>
      )}
      {error && <small className={styles.error}>{error}</small>}
    </div>
  );
}

export function HoursSettings({ initial }: { initial: Settings["schedule"] }) {
  return (
    <SettingsForm
      group="schedule"
      id="hours"
      eyebrow="Schedule"
      title="Opening hours and sessions"
      description="Sessions run back to back from opening time; the last one must end by closing time. Saving is refused if an upcoming booking would no longer fit."
      initial={initial}
    >
      {({ draft, set }) => {
        const setDay = (day: Day, hours: DayHours) => set("weeklyHours", { ...draft.weeklyHours, [day]: hours });
        return (
          <>
            <div className={styles.week}>
              {DAYS.map((day) => (
                <DayRow key={day} day={day} hours={draft.weeklyHours[day]} onChange={(h) => setDay(day, h)} />
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => set("weeklyHours", Object.fromEntries(DAYS.map((d) => [d, draft.weeklyHours.mon])) as Settings["schedule"]["weeklyHours"])}
              >
                Copy Monday to every day
              </button>
            </div>

            <div className={styles.grid}>
              <NumberField label="Session length" unit="min" path="slotMinutes" hint="One booking slot, from start to the next group." value={draft.slotMinutes} onChange={(v) => set("slotMinutes", v)} />
              <NumberField label="Drive time" unit="min" path="driveMinutes" hint="Time actually on track. The rest is briefing and changeover." value={draft.driveMinutes} onChange={(v) => set("driveMinutes", v)} />
              <NumberField label="Arrive early by" unit="min" path="arriveEarlyMinutes" hint="Shown to customers when they book." value={draft.arriveEarlyMinutes} onChange={(v) => set("arriveEarlyMinutes", v)} />
              <NumberField label="Online booking closes" unit="min before" path="onlineCutoffMinutes" hint="After this, only the desk can sell the session." value={draft.onlineCutoffMinutes} onChange={(v) => set("onlineCutoffMinutes", v)} />
              <NumberField label="Bookable ahead" unit="days" path="bookingWindowDays" hint="How far in advance customers can book." value={draft.bookingWindowDays} onChange={(v) => set("bookingWindowDays", v)} />
            </div>
          </>
        );
      }}
    </SettingsForm>
  );
}
