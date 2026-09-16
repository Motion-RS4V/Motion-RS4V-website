"use client";

import type { Settings } from "@/server/settings/schema";
import { NumberField, SettingsForm } from "./form";
import styles from "./Settings.module.css";

export function EligibilitySettings({ initial }: { initial: Settings["eligibility"] }) {
  return (
    <SettingsForm
      group="eligibility"
      id="eligibility"
      eyebrow="Safety"
      title="Who can drive"
      description="Shown on the website and in the FAQ. Staff check these at the desk."
      initial={initial}
    >
      {({ draft, set }) => (
        <div className={styles.grid}>
          <NumberField label="Minimum age" unit="years" path="minAgeYears" value={draft.minAgeYears} onChange={(v) => set("minAgeYears", v)} />
          <NumberField label="Minimum height" unit="cm" path="minHeightCm" value={draft.minHeightCm} onChange={(v) => set("minHeightCm", v)} />
        </div>
      )}
    </SettingsForm>
  );
}
