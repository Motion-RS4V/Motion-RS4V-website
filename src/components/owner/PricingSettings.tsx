"use client";

import { formatRupees } from "@/lib/format";
import { DAYS, type Day, type PricingRule, type Settings } from "@/server/settings/schema";
import { NumberField, SettingsForm, TextField, Toggle, useFieldError } from "./form";
import styles from "./Settings.module.css";

const DAY_SHORT: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function RuleCard({
  index,
  rule,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  index: number;
  rule: PricingRule;
  count: number;
  onChange: (rule: PricingRule) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const path = `rules.${index}`;
  const daysError = useFieldError(`${path}.days`);
  const toError = useFieldError(`${path}.to`);
  const toggleDay = (day: Day) =>
    onChange({ ...rule, days: rule.days.includes(day) ? rule.days.filter((d) => d !== day) : DAYS.filter((d) => d === day || rule.days.includes(d)) });

  return (
    <li className={styles.rule}>
      <div className={styles.grid}>
        <TextField label="Name" path={`${path}.label`} placeholder="Weekend" value={rule.label} onChange={(label) => onChange({ ...rule, label })} />
        <NumberField label="Price per driver" unit="₹" scale={100} decimals={2} path={`${path}.pricePaise`} value={rule.pricePaise} onChange={(pricePaise) => onChange({ ...rule, pricePaise })} />
      </div>

      <fieldset className={styles.days} data-invalid={daysError ? true : undefined}>
        <legend>Days</legend>
        {DAYS.map((day) => (
          <label key={day} className={styles.dayChip}>
            <input type="checkbox" checked={rule.days.includes(day)} onChange={() => toggleDay(day)} />
            <span>{DAY_SHORT[day]}</span>
          </label>
        ))}
        {daysError && <small className={styles.error}>Pick at least one day.</small>}
      </fieldset>

      <div className={styles.ruleTimes} data-invalid={toError ? true : undefined}>
        <label>
          <span>From</span>
          <input type="time" step={300} value={rule.from ?? ""} onChange={(e) => onChange({ ...rule, from: e.target.value || undefined })} />
        </label>
        <label>
          <span>Until</span>
          <input type="time" step={300} value={rule.to ?? ""} onChange={(e) => onChange({ ...rule, to: e.target.value || undefined })} />
        </label>
        <small className={toError ? styles.error : undefined}>{toError ?? "Leave both empty for the whole day. Matches sessions starting in this window."}</small>
      </div>

      <div className={styles.ruleActions}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="Move rule up">
          ↑
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label="Move rule down">
          ↓
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

export function PricingSettings({ initial }: { initial: Settings["pricing"] }) {
  return (
    <SettingsForm
      group="pricing"
      id="pricing"
      eyebrow="Pricing"
      title="Prices"
      description="Price per driver, per session. Bookings keep the price they were sold at; changes only apply to new bookings."
      initial={initial}
    >
      {({ draft, set }) => {
        const setRule = (i: number, rule: PricingRule) => set("rules", draft.rules.map((r, j) => (j === i ? rule : r)));
        const moveRule = (from: number, to: number) => {
          const rules = [...draft.rules];
          const [rule] = rules.splice(from, 1);
          rules.splice(to, 0, rule);
          set("rules", rules);
        };
        return (
          <>
            <div className={styles.grid}>
              <NumberField label="Standard price" unit="₹" scale={100} decimals={2} path="basePricePaise" hint="Used whenever no rule below matches." value={draft.basePricePaise} onChange={(v) => set("basePricePaise", v)} />
              <NumberField label="GST rate" unit="%" decimals={2} path="gstRatePercent" value={draft.gstRatePercent} onChange={(v) => set("gstRatePercent", v)} />
            </div>
            <Toggle
              label="Prices include GST"
              hint={draft.pricesIncludeGst ? "Customers pay exactly the price shown." : "GST is added on top at checkout."}
              checked={draft.pricesIncludeGst}
              onChange={(v) => set("pricesIncludeGst", v)}
            />

            <div className={styles.rules}>
              <div className={styles.rulesHead}>
                <span className="tel">Special prices</span>
                <small>When several rules match a session, the lowest one in the list wins.</small>
              </div>
              {draft.rules.length === 0 ? (
                <p className={styles.note}>No special prices. Every session costs {Number.isFinite(draft.basePricePaise) ? formatRupees(draft.basePricePaise) : "the standard price"}.</p>
              ) : (
                <ol className={styles.ruleList}>
                  {draft.rules.map((rule, i) => (
                    <RuleCard
                      key={i}
                      index={i}
                      count={draft.rules.length}
                      rule={rule}
                      onChange={(r) => setRule(i, r)}
                      onMove={(to) => moveRule(i, to)}
                      onRemove={() => set("rules", draft.rules.filter((_, j) => j !== i))}
                    />
                  ))}
                </ol>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => set("rules", [...draft.rules, { label: "", days: ["sat", "sun"], pricePaise: draft.basePricePaise }])}
              >
                + Add special price
              </button>
            </div>
          </>
        );
      }}
    </SettingsForm>
  );
}
