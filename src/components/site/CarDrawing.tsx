import styles from "./Tracks.module.css";

/** Side-profile setup drawings. Callouts describe the car type for each track, not measured values. */
export function CarDrawing({ variant }: { variant: "track" | "offroad" }) {
  if (variant === "offroad") {
    return (
      <svg viewBox="0 0 420 172" className={styles.svg} aria-hidden="true">
        <path className={styles.gnd} d="M0 140 H420" />
        <path className={styles.ln} d="M112 104 L134 62 M312 104 L290 62" />
        <path className={styles.shell} d="M58 76 L58 58 Q60 46 80 44 L150 42 Q178 20 220 18 L262 18 Q298 20 322 40 L362 46 Q374 50 374 62 L374 76 Z" />
        <circle className={styles.tyre} cx="112" cy="104" r="34" />
        <circle className={styles.knob} cx="112" cy="104" r="31" />
        <circle className={styles.hub} cx="112" cy="104" r="11" />
        <circle className={styles.tyre} cx="312" cy="104" r="34" />
        <circle className={styles.knob} cx="312" cy="104" r="31" />
        <circle className={styles.hub} cx="312" cy="104" r="11" />
        <path className={styles.call} d="M128 70 L60 26 L8 26" />
        <text className={styles.lab} x="8" y="19">Long-travel shocks</text>
        <path className={styles.call} d="M170 76 V140 M165 76 H175 M165 140 H175" />
        <text className={styles.lab} x="180" y="113">High clearance</text>
        <path className={styles.call} d="M334 132 L358 158 L412 158" />
        <text className={styles.lab} x="412" y="152" textAnchor="end">Chunky tyres</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 420 172" className={styles.svg} aria-hidden="true">
      <path className={styles.gnd} d="M0 140 H420" />
      <path className={styles.shell} d="M58 112 L58 96 Q60 84 80 82 L150 78 Q175 56 215 54 L265 54 Q300 56 325 76 L360 82 Q372 86 372 98 L372 112 Z" />
      <path className={styles.ln} d="M66 82 L66 66 M60 66 L102 66" />
      <circle className={styles.tyre} cx="112" cy="115" r="25" />
      <circle className={styles.hub} cx="112" cy="115" r="9" />
      <circle className={styles.tyre} cx="312" cy="115" r="25" />
      <circle className={styles.hub} cx="312" cy="115" r="9" />
      <path className={styles.call} d="M84 66 L60 26 L8 26" />
      <text className={styles.lab} x="8" y="19">Rear wing</text>
      <path className={styles.call} d="M170 112 V140 M165 112 H175 M165 140 H175" />
      <text className={styles.lab} x="180" y="131">Low ride height</text>
      <path className={styles.call} d="M330 134 L356 158 L412 158" />
      <text className={styles.lab} x="412" y="152" textAnchor="end">Slick tyres</text>
    </svg>
  );
}
