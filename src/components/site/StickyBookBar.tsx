"use client";

import { useEffect, useState } from "react";
import styles from "./StickyBookBar.module.css";

/** Phone-only booking bar. Steps aside while the booking section itself is on screen. */
export function StickyBookBar({ priceLabel, driveMinutes }: { priceLabel: string; driveMinutes: number }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const target = document.getElementById("book");
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting), { rootMargin: "-20% 0px -20% 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`${styles.bar} ${hidden ? styles.hidden : ""}`}>
      <div>
        <span className="tel">Per person</span>
        <span className="val">
          {priceLabel} · {driveMinutes} min
        </span>
      </div>
      <a className="btn btn-primary btn-sm" href="#book">
        Book a Session
      </a>
    </div>
  );
}
