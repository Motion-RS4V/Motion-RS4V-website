"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { StaffSearch } from "./StaffSearch";
import styles from "./StaffNav.module.css";

const LINKS = [
  { href: "/staff", label: "Board" },
  { href: "/staff/sell", label: "Walk-in" },
  { href: "/staff/fleet", label: "Fleet" },
  { href: "/staff/blocks", label: "Blocks" },
  { href: "/staff/takings", label: "Takings" },
];

/** Shown to owners only. The pages and APIs check the role again; hiding a link isn't access control. */
const OWNER_LINKS = [
  { href: "/staff/dashboard", label: "Dashboard" },
  { href: "/staff/customers", label: "Customers" },
  { href: "/staff/special-dates", label: "Special dates" },
  { href: "/staff/team", label: "Team" },
  { href: "/staff/activity", label: "Activity" },
  { href: "/staff/settings", label: "Settings" },
];

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", MANAGER: "Manager", STAFF: "Staff" };

function Tabs({ label, links, pathname }: { label?: string; links: { href: string; label: string }[]; pathname: string }) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      {label && <span className={styles.groupLabel}>{label}</span>}
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={styles.tab} aria-current={pathname === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

export function StaffNav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const owner = role === "OWNER";

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/staff/logout", { method: "POST" });
    router.replace("/staff/login");
    router.refresh();
  }

  return (
    <header className={styles.nav}>
      <div className={styles.top}>
        <Link href={owner ? "/staff/dashboard" : "/staff"} className={styles.brand} aria-label="Console home">
          <span>
            RS<i>4</i>V
          </span>
          <small>Console</small>
        </Link>
        <div className={styles.search}>
          <StaffSearch />
        </div>
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden>
            {name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className={styles.who}>
            {name}
            <small>{ROLE_LABEL[role] ?? "Staff"}</small>
          </span>
          <button type="button" className={styles.signOut} onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
      <nav className={styles.tabs} aria-label="Console">
        <div className={styles.tabsInner}>
          {owner && <Tabs label="Owner" links={OWNER_LINKS} pathname={pathname} />}
          <Tabs label={owner ? "Desk" : undefined} links={LINKS} pathname={pathname} />
        </div>
      </nav>
    </header>
  );
}
