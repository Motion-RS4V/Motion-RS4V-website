"use client";

import type { Settings } from "@/server/settings/schema";
import { NumberField, SettingsForm, Toggle } from "./form";
import styles from "./Settings.module.css";

export function KioskSettings({ initial }: { initial: Settings["kiosk"] }) {
  return (
    <SettingsForm
      group="kiosk"
      id="kiosk"
      eyebrow="Kiosk"
      title="Screen at the counter"
      description="The self-service screen customers book on themselves. It sells right up to the end of a session, like a walk-in, and takes payment by UPI or card. Set each screen up under Kiosk screens."
      initial={initial}
    >
      {({ draft, set }) => (
        <>
          <Toggle
            label="Booking on the kiosk"
            hint={
              draft.enabled
                ? "Set-up screens can sell seats for today's sessions."
                : "Screens show 'Please book at the desk'. Staff sales and the website are unaffected."
            }
            checked={draft.enabled}
            onChange={(v) => set("enabled", v)}
          />
          <div className={styles.grid}>
            <NumberField
              label="Payment hold"
              unit="min"
              path="paymentHoldMinutes"
              min={1}
              hint="Seats stay reserved this long while they pay. Shorter than the website's, because someone is usually waiting behind them."
              value={draft.paymentHoldMinutes}
              onChange={(v) => set("paymentHoldMinutes", v)}
            />
            <NumberField
              label="Clears itself after"
              unit="sec idle"
              path="idleResetSeconds"
              min={15}
              hint="Goes back to the first screen and wipes what the last customer typed. Never during payment."
              value={draft.idleResetSeconds}
              onChange={(v) => set("idleResetSeconds", v)}
            />
          </div>
        </>
      )}
    </SettingsForm>
  );
}
