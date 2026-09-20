import { Wordmark } from "@/components/site/Wordmark";
import styles from "./Kiosk.module.css";

/** Full-screen message for a screen that can't sell: unpaired, switched off, or done for the day. */
export function KioskNotice({ title, body }: { title: string; body: string }) {
  return (
    <main className={`${styles.screen} ${styles.notice}`}>
      <Wordmark />
      <h1>{title}</h1>
      <p>{body}</p>
    </main>
  );
}
