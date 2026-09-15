"use client";

import type { ReactNode } from "react";

export const PICK_EXPERIENCE_EVENT = "rs4v:pick-experience";

/** Jumps to the booking section with one experience pre-selected, without reloading the page. */
export function PickExperienceLink({ code, className, children }: { code: string; className?: string; children: ReactNode }) {
  return (
    <a
      className={className}
      href="#book"
      onClick={() => window.dispatchEvent(new CustomEvent(PICK_EXPERIENCE_EVENT, { detail: code }))}
    >
      {children}
    </a>
  );
}
