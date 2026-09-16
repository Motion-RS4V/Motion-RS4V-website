"use client";

import { useEffect } from "react";

export const ATTRIBUTION_KEY = "rs4v:attribution";

/** Remembers where this visit came from (UTM tags, referring site, landing page) so checkout can record it. */
export function AttributionCapture() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(ATTRIBUTION_KEY)) return;
      const params = new URLSearchParams(window.location.search);
      const referrer = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : null;
      sessionStorage.setItem(
        ATTRIBUTION_KEY,
        JSON.stringify({
          utmSource: params.get("utm_source"),
          utmMedium: params.get("utm_medium"),
          utmCampaign: params.get("utm_campaign"),
          referrer: referrer?.slice(0, 300) ?? null,
          landingPath: window.location.pathname.slice(0, 200),
        }),
      );
    } catch {
      // Private browsing can block storage; attribution is optional.
    }
  }, []);
  return null;
}

export function readAttribution(): Record<string, string | null> | undefined {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
