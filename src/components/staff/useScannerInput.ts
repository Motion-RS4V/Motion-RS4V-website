"use client";

import { useEffect, useRef } from "react";

/** Booking references look like RS4V-7K2M9Q, so a scan is easy to tell apart from ordinary typing. */
const COMPLETE = /^RS4V-[2-9A-HJKMNP-Z]{6}$/;
const PARTIAL = /^(R|RS|RS4|RS4V|RS4V-[2-9A-HJKMNP-Z]{0,5})$/;

/** Handheld scanners type far faster than any person; this gap keeps the two apart. */
const MAX_GAP_MS = 80;

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable;
}

/**
 * Picks up a booking reference from a USB barcode scanner, which types the code like a keyboard.
 * The desk screen has no camera, so this lets staff scan from any page without tapping the search
 * box first. Only a fast burst spelling a whole reference counts, and only when no field has focus,
 * so it never swallows someone typing a customer's name.
 */
export function useScannerInput(onScan: (reference: string) => void) {
  const latest = useRef(onScan);

  useEffect(() => {
    latest.current = onScan;
  });

  useEffect(() => {
    let buffer = "";
    let lastKeyAt = 0;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
      if (isTyping(event.target)) return;

      if (event.timeStamp - lastKeyAt > MAX_GAP_MS) buffer = "";
      lastKeyAt = event.timeStamp;

      const next = buffer + event.key.toUpperCase();
      if (COMPLETE.test(next)) {
        buffer = "";
        latest.current(next);
        return;
      }
      buffer = PARTIAL.test(next) ? next : "";
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
