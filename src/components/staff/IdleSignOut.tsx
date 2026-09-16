"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Signs the console out after a long idle spell, so a tablet left on the desk (or lost) doesn't stay open.
 * The window is deliberately long: staff shouldn't be logged out mid-shift.
 */
const IDLE_MS = 4 * 60 * 60 * 1000;
const EVENTS = ["pointerdown", "keydown", "visibilitychange", "focus"] as const;

export function IdleSignOut() {
  const router = useRouter();
  const lastActive = useRef(0);

  useEffect(() => {
    lastActive.current = Date.now();
    const touch = () => {
      lastActive.current = Date.now();
    };
    for (const event of EVENTS) window.addEventListener(event, touch, { passive: true });

    const timer = setInterval(async () => {
      if (Date.now() - lastActive.current < IDLE_MS) return;
      await fetch("/api/staff/logout", { method: "POST" }).catch(() => {});
      router.replace("/staff/login");
      router.refresh();
    }, 60_000);

    return () => {
      clearInterval(timer);
      for (const event of EVENTS) window.removeEventListener(event, touch);
    };
  }, [router]);

  return null;
}
