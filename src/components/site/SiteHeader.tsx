"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./SiteHeader.module.css";
import { Wordmark } from "./Wordmark";

const NAV = [
  { href: "#how", label: "How It Works" },
  { href: "#tracks", label: "Tracks" },
  { href: "#book", label: "Pricing" },
  { href: "#venue", label: "Venue" },
  { href: "#faq", label: "FAQ" },
  { href: "/find-booking", label: "Find My Booking" },
];

/** Transparent over the hero, solid once the visitor scrolls past it. */
export function SiteHeader() {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`${styles.header} ${solid ? styles.solid : ""}`}>
      <div className={`wrap ${styles.inner}`}>
        <Wordmark />
        <nav className={styles.nav} aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <a className={`btn btn-primary btn-sm ${styles.cta}`} href="#book">
          Book a Session <span className="arr">→</span>
        </a>
      </div>
    </header>
  );
}
