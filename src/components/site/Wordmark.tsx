import Link from "next/link";
import styles from "./Wordmark.module.css";

export function Wordmark({ href = "#top" }: { href?: string }) {
  return (
    <Link className={styles.mark} href={href} aria-label="Motion RS4V home">
      <span className={styles.motion}>Motion</span>
      <span className={styles.word}>
        RS<i>4</i>V
      </span>
    </Link>
  );
}
