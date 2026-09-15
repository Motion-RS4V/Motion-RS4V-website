"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Adds `data-in-view` once the element scrolls into view, for one-off reveal details.
 * Content is fully visible without it; the attribute only starts small flourishes like a line drawing in.
 */
export function InView({ as: Tag = "div", className, children }: { as?: "div" | "section"; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -30% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={className} data-in-view={inView ? "true" : "false"}>
      {children}
    </Tag>
  );
}
