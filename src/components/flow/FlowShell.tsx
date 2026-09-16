import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/site/Wordmark";
import styles from "./FlowShell.module.css";

/** Minimal chrome for task pages (checkout, manage booking): logo, a way home, and the page. */
export function FlowShell({ children, backHref = "/", backLabel = "Home" }: { children: ReactNode; backHref?: string; backLabel?: string }) {
  return (
    <>
      <header className={styles.bar}>
        <div className={`wrap ${styles.barInner}`}>
          <Wordmark href="/" />
          <Link className="btn btn-ghost btn-sm" href={backHref}>
            {backLabel}
          </Link>
        </div>
      </header>
      <main className={styles.main}>
        <div className="wrap">{children}</div>
      </main>
    </>
  );
}

export function FlowHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className={styles.heading}>
      <span className="tel tel-o">{eyebrow}</span>
      <h1>{title}</h1>
      {children && <div className={styles.lede}>{children}</div>}
    </div>
  );
}

/** Full-page message for dead ends: expired links, sessions that are gone. */
export function FlowNotice({ eyebrow, title, body, actionHref, actionLabel }: { eyebrow: string; title: string; body: string; actionHref: string; actionLabel: string }) {
  return (
    <div className={styles.notice}>
      <FlowHeading eyebrow={eyebrow} title={title}>
        <p>{body}</p>
      </FlowHeading>
      <Link className="btn btn-primary" href={actionHref}>
        {actionLabel} <span className="arr">→</span>
      </Link>
    </div>
  );
}
