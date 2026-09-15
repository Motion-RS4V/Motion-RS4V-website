"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Opens the onboard frame to full-bleed as it scrolls in, like dropping a visor. */
export function FpvFrame({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      const progress = Math.min(1, Math.max(0, (vh - el.getBoundingClientRect().top) / (vh * 0.85)));
      el.style.setProperty("--inset", ((1 - progress) * 6).toFixed(2));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
