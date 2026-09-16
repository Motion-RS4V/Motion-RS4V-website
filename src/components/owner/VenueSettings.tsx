"use client";

import type { Settings } from "@/server/settings";
import { SettingsForm, TextField } from "./form";
import styles from "./Settings.module.css";

export function VenueSettings({ initial }: { initial: Settings["venue"] }) {
  return (
    <SettingsForm
      group="venue"
      id="venue"
      eyebrow="Venue"
      title="Name and contact"
      description="Shown in the website footer, the venue section, the policy pages and every booking email."
      initial={initial}
    >
      {({ draft, set }) => (
        <div className={styles.grid}>
          <TextField label="Venue name" path="name" value={draft.name} onChange={(v) => set("name", v)} />
          <TextField
            label="Registered business name"
            path="legalName"
            hint="As on your GST or company registration. Shown on the terms, privacy and refund pages."
            placeholder={draft.name}
            value={draft.legalName}
            onChange={(v) => set("legalName", v)}
          />
          <TextField label="Address" path="address" value={draft.address} onChange={(v) => set("address", v)} wide />
          <TextField label="Google Maps link" path="mapsUrl" type="url" placeholder="https://maps.app.goo.gl/…" value={draft.mapsUrl} onChange={(v) => set("mapsUrl", v)} wide />
          <TextField label="WhatsApp number" path="whatsappNumber" type="tel" placeholder="+91…" value={draft.whatsappNumber} onChange={(v) => set("whatsappNumber", v)} />
          <TextField label="Email" path="email" type="email" value={draft.email} onChange={(v) => set("email", v)} />
          <TextField label="Instagram handle" path="instagramHandle" placeholder="rs4v.raipur" value={draft.instagramHandle} onChange={(v) => set("instagramHandle", v)} />
          <p className={styles.readonly}>
            <span>Timezone</span>
            <b>{draft.timezone}</b>
            <small>Fixed after setup: changing it would shift the time of every booked session.</small>
          </p>
        </div>
      )}
    </SettingsForm>
  );
}
