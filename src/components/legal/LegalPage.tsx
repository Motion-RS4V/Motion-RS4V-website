import Link from "next/link";
import type { ReactNode } from "react";
import { FlowHeading, FlowShell } from "@/components/flow/FlowShell";
import { whatsappUrl } from "@/lib/links";
import type { Settings } from "@/server/settings/schema";
import styles from "./Legal.module.css";

export const POLICY_PAGES = [
  { href: "/terms", label: "Terms of booking" },
  { href: "/refunds", label: "Cancellation & refunds" },
  { href: "/privacy", label: "Privacy policy" },
] as const;

/** Wording last reviewed. Numbers inside the policies come from live settings and don't change this date. */
export const POLICY_UPDATED = "16 September 2026";

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function LegalPage({
  current,
  eyebrow,
  title,
  intro,
  sections,
  venue,
  operator,
}: {
  current: (typeof POLICY_PAGES)[number]["href"];
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: { id: string; title: string; body: ReactNode }[];
  venue: Settings["venue"];
  operator: string;
}) {
  const whatsapp = whatsappUrl(venue.whatsappNumber);
  return (
    <FlowShell>
      <FlowHeading eyebrow={eyebrow} title={title}>
        {intro}
        <p className={styles.updated}>Last updated {POLICY_UPDATED}</p>
      </FlowHeading>

      <nav className={styles.tabs} aria-label="Policies">
        {POLICY_PAGES.map((p) => (
          <Link key={p.href} href={p.href} aria-current={p.href === current ? "page" : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>

      <div className={styles.layout}>
        <aside className={styles.toc} aria-label="On this page">
          <span className="tel">On this page</span>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
            <li>
              <a href="#contact">Contact us</a>
            </li>
          </ol>
        </aside>

        <article className={styles.prose}>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id}>
              <h2>
                <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}

          <section id="contact" className={styles.contact}>
            <h2>
              <span className={styles.num}>{String(sections.length + 1).padStart(2, "0")}</span>
              Contact us
            </h2>
            <p>
              {venue.name} is operated by <strong>{operator}</strong>.
            </p>
            <dl>
              <div>
                <dt>Address</dt>
                <dd>{venue.address}</dd>
              </div>
              {venue.email && (
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${venue.email}`}>{venue.email}</a>
                  </dd>
                </div>
              )}
              {whatsapp && (
                <div>
                  <dt>WhatsApp</dt>
                  <dd>
                    <a href={whatsapp} target="_blank" rel="noreferrer">
                      {venue.whatsappNumber}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {!venue.email && !whatsapp && <p>Please ask at the venue desk.</p>}
          </section>
        </article>
      </div>
    </FlowShell>
  );
}
