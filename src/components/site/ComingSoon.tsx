import Link from "next/link";
import styles from "./ComingSoon.module.css";
import { Wordmark } from "./Wordmark";

/** Holding page for routes built in a later step. */
export function ComingSoon({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <>
      <header className={styles.bar}>
        <div className={`wrap ${styles.barInner}`}>
          <Wordmark href="/" />
          <Link className="btn btn-ghost btn-sm" href="/">
            Home
          </Link>
        </div>
      </header>
      <main className={styles.page}>
        <div className={`wrap ${styles.copy}`}>
          <span className="tel tel-o">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{body}</p>
          <Link className="btn btn-primary" href="/#book">
            Book a session <span className="arr">→</span>
          </Link>
        </div>
      </main>
    </>
  );
}
