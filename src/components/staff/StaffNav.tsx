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
];

export function StaffNav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/staff/logout", { method: "POST" });
    router.replace("/staff/login");
    router.refresh();
  }

  return (
    <header className={styles.nav}>
      <div className={styles.row}>
        <span className={styles.brand}>
          RS<i>4</i>V <small>Console</small>
        </span>
        <nav className={styles.links}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={styles.user}>
          <span className={styles.who}>
            {name}
            <small>{role === "OWNER" ? "Owner" : "Staff"}</small>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? "…" : "Sign out"}
          </button>
        </div>
      </div>
      <StaffSearch />
    </header>
  );
}
