"use client";

import { useEffect, useState } from "react";
import { openState, uniformHours, type WeeklyHours } from "@/lib/venue-time";

/**
 * "Open now · until 22:00". Rendered after mount so the server-cached page never shows a stale open/closed state.
 */
export function OpenStatus({ hours, timezone, className }: { hours: WeeklyHours; timezone: string; className?: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(openState(hours, timezone).label);
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [hours, timezone]);

  const fallback = uniformHours(hours);
  return <span className={className}>{label ?? (fallback ? `Open daily ${fallback}` : "See opening hours")}</span>;
}
