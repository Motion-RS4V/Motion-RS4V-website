"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./HowItWorks.module.css";

type Props = { driveMinutes: number; arriveEarlyMinutes: number };

function mmss(seconds: number) {
  const s = Math.round(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Three steps, with a drive timer that counts up while the reader scrolls through the Drive step. */
export function HowItWorks({ driveMinutes, arriveEarlyMinutes }: Props) {
  const steps = [
    {
      label: "Step 1",
      title: "Check in",
      status: "Not started",
      body: `Arrive ${arriveEarlyMinutes} minutes early and show your booking reference or QR code at the desk. Walk-ins are welcome when seats are free.`,
    },
    {
      label: "Step 2",
      title: "Get set",
      status: "Getting set",
      body: "Staff seat you at a steering rig, you pick a VR headset or the screen, and they run a quick controls check.",
    },
    {
      label: `Step 3 · ${driveMinutes} minutes`,
      title: "Drive",
      status: "Driving",
      body: "You see live through the camera on your car. Steer, accelerate, brake. All of it happens for real, on a real track.",
    },
  ];

  const listRef = useRef<HTMLOListElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const list = listRef.current;
    const panel = panelRef.current;
    if (!list || !panel) return;
    const items = Array.from(list.querySelectorAll<HTMLLIElement>("li"));
    let frame = 0;

    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.55;
      let current = 0;
      items.forEach((item, i) => {
        if (item.getBoundingClientRect().top <= line) current = i;
      });
      const last = items.length - 1;
      let elapsed = 0;
      if (current === last) {
        const r = items[last].getBoundingClientRect();
        elapsed = Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height))) * driveMinutes * 60;
      }
      const listRect = list.getBoundingClientRect();
      list.style.setProperty("--fill", String(Math.min(1, Math.max(0, (line - listRect.top) / listRect.height))));
      panel.style.setProperty("--progress", String(elapsed / (driveMinutes * 60)));
      setActive(current);
      setSeconds(elapsed);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [driveMinutes]);

  const current = active ?? 0;

  return (
    <section className="section" id="how">
      <div className="wrap">
        <div className="head">
          <span className="tel tel-o">How it works</span>
          <h2>Check in. Get set. Drive.</h2>
          <p>Three simple steps, then {driveMinutes} minutes behind the wheel of a real car. No experience needed.</p>
        </div>

        <div className={styles.grid} data-enhanced={active !== null ? "true" : "false"}>
          <aside className={styles.panel} ref={panelRef} aria-label="Drive timer">
            <div className={styles.clockFor}>
              <span className="tel">Drive time</span>
              <span className={styles.status}>{steps[current].status}</span>
            </div>
            <span className={styles.clock}>{mmss(seconds)}</span>
            <div className={styles.bar} aria-hidden="true">
              <div className={styles.fill} />
            </div>
            <div className={styles.legend}>
              <span>0 min</span>
              <span>{Math.round(driveMinutes / 2)} min</span>
              <span>{driveMinutes} min</span>
            </div>
          </aside>

          <ol className={styles.spine} ref={listRef}>
            {steps.map((step, i) => (
              <li
                key={step.title}
                className={styles.step}
                data-state={active === null ? "idle" : i === current ? "active" : i < current ? "past" : "future"}
              >
                <span className={styles.stepLabel}>{step.label}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
