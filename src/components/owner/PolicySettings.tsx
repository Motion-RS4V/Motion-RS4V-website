"use client";

import type { Settings } from "@/server/settings/schema";
import { NumberField, SettingsForm, Toggle } from "./form";
import styles from "./Settings.module.css";

export function PolicySettings({ initial }: { initial: Settings["policy"] }) {
  return (
    <SettingsForm
      group="policy"
      id="policy"
      eyebrow="Policy"
      title="Booking rules"
      description="Each booking keeps the cancellation and change rules it was sold under, so tightening these never affects people who have already paid."
      initial={initial}
    >
      {({ draft, set }) => (
        <>
          <div className={styles.grid}>
            <NumberField label="Most seats per booking" unit="seats" path="maxSeatsPerBooking" min={1} value={draft.maxSeatsPerBooking} onChange={(v) => set("maxSeatsPerBooking", v)} />
            <NumberField label="Payment hold" unit="min" path="paymentHoldMinutes" min={1} hint="Seats stay reserved this long while the customer pays." value={draft.paymentHoldMinutes} onChange={(v) => set("paymentHoldMinutes", v)} />
            <NumberField label="Free cancellation until" unit="hours before" path="freeCancelHours" hint="Cancelling later than this gets no refund." value={draft.freeCancelHours} onChange={(v) => set("freeCancelHours", v)} />
            <NumberField label="Changes allowed until" unit="min before" path="rescheduleCutoffMinutes" value={draft.rescheduleCutoffMinutes} onChange={(v) => set("rescheduleCutoffMinutes", v)} />
            <NumberField label="Times a customer can move" unit="times" path="maxReschedules" hint="0 turns online rescheduling off." value={draft.maxReschedules} onChange={(v) => set("maxReschedules", v)} />
            <NumberField label="No-show after" unit="min late" path="noShowGraceMinutes" hint="Seats not checked in by then are released to walk-ins." value={draft.noShowGraceMinutes} onChange={(v) => set("noShowGraceMinutes", v)} />
          </div>
          <Toggle
            label="Limit seats by ready cars"
            hint={
              draft.limitSeatsByReadyCars
                ? "A track can't sell more seats than it has cars marked Ready."
                : "Only the number of working rigs limits seats; cars are shared as needed."
            }
            checked={draft.limitSeatsByReadyCars}
            onChange={(v) => set("limitSeatsByReadyCars", v)}
          />
        </>
      )}
    </SettingsForm>
  );
}
