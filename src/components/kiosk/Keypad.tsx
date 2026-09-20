"use client";

import styles from "./Kiosk.module.css";

const LETTER_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const DIGIT_ROWS = ["123", "456", "789"];

/**
 * On-screen keys for a touchscreen with no keyboard. Windows' own keyboard doesn't always appear
 * on a kiosk-mode browser, so the screen brings its own.
 */
export function Keypad({
  mode,
  value,
  onChange,
  maxLength,
}: {
  mode: "letters" | "digits";
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
}) {
  const press = (key: string) => {
    if (value.length >= maxLength) return;
    onChange(value + key);
  };

  return (
    <div className={styles.keypad} data-mode={mode}>
      {(mode === "letters" ? LETTER_ROWS : DIGIT_ROWS).map((row) => (
        <div key={row} className={styles.keyRow}>
          {[...row].map((key) => (
            <button key={key} type="button" className={styles.key} onClick={() => press(key)}>
              {key}
            </button>
          ))}
        </div>
      ))}
      <div className={styles.keyRow}>
        {mode === "letters" ? (
          <button type="button" className={`${styles.key} ${styles.keyWide}`} onClick={() => press(" ")}>
            Space
          </button>
        ) : (
          <button type="button" className={styles.key} onClick={() => press("0")}>
            0
          </button>
        )}
        <button type="button" className={`${styles.key} ${styles.keyWide}`} onClick={() => onChange(value.slice(0, -1))} aria-label="Delete">
          ⌫
        </button>
      </div>
    </div>
  );
}
