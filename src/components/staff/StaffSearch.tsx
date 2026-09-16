"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QrScanButton } from "./QrScanButton";
import styles from "./StaffSearch.module.css";

type Result = { id: string; reference: string; name: string; phone: string; status: string; seatCount: number; dateLabel: string; timeLabel: string };

/** Find a booking by reference, mobile number or name; or scan the customer's QR code. */
export function StaffSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const tooShort = query.trim().length < 3;
  const shown = tooShort ? [] : results;

  useEffect(() => {
    if (query.trim().length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/staff/search?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" })
        .then((r) => r.json())
        .then((b) => {
          setResults(b.results ?? []);
          setOpen(true);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function goTo(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/staff/booking/${id}`);
  }

  return (
    <div className={styles.wrap} ref={box}>
      <div className={styles.field}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => shown.length > 0 && setOpen(true)}
          placeholder="Search booking reference, mobile or name"
          aria-label="Search bookings"
          autoComplete="off"
        />
        <QrScanButton
          onScan={(text) => {
            setQuery(text);
            setOpen(true);
            // A scanned reference is unambiguous: jump straight to the booking.
            fetch(`/api/staff/search?q=${encodeURIComponent(text)}`, { cache: "no-store" })
              .then((r) => r.json())
              .then((b) => {
                if (b.results?.length === 1) goTo(b.results[0].id);
                else setResults(b.results ?? []);
              })
              .catch(() => {});
          }}
        />
      </div>
      {open && shown.length > 0 && (
        <ul className={styles.results}>
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => goTo(r.id)}>
                <span className={styles.ref}>{r.reference}</span>
                <span className={styles.who}>
                  {r.name} · {r.phone}
                </span>
                <span className={styles.when}>
                  {r.dateLabel}, {r.timeLabel} · {r.seatCount} {r.seatCount === 1 ? "driver" : "drivers"} · {r.status.replace("_", " ").toLowerCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !tooShort && shown.length === 0 && <p className={styles.empty}>No bookings found for “{query}”.</p>}
    </div>
  );
}
