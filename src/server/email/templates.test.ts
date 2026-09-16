import { describe, expect, it } from "vitest";
import { escapeHtml, renderEmail } from "./templates";

const base = { name: "Riya", reference: "RS4V-7K2M9Q", dateLabel: "Thu 17 Sep 2026", timeLabel: "18:15 – 18:30" };

describe("email templates", () => {
  it("renders a confirmation with every detail in both HTML and text", () => {
    const email = renderEmail("booking.confirmed", {
      ...base,
      drivers: [
        { count: 2, experience: "Track / Drift", track: "Racing track" },
        { count: 1, experience: "Off-road", track: "Off-road track" },
      ],
      totalLabel: "₹1,497",
      manageUrl: "https://rs4v.in/manage/abc",
      arriveEarlyMinutes: 10,
      address: "Zora The Mall, Raipur",
      mapsUrl: "",
    });
    expect(email.subject).toBe("You're booked: Thu 17 Sep 2026, 18:15 · RS4V-7K2M9Q");
    for (const part of ["RS4V-7K2M9Q", "18:15 – 18:30", "₹1,497", "https://rs4v.in/manage/abc", "10 minutes early"]) {
      expect(email.html).toContain(part);
      expect(email.text).toContain(part);
    }
    expect(email.text).toContain("2 × Track / Drift (Racing track), 1 × Off-road (Off-road track)");
  });

  it("escapes customer-supplied names so they can't inject HTML", () => {
    const email = renderEmail("booking.links", {
      name: `<img src=x onerror="alert(1)">`,
      bookings: [{ reference: "RS4V-AAAAAA", dateLabel: "Fri", timeLabel: "10:00 – 10:15", manageUrl: "https://x/manage/1?a=1&b=2" }],
    });
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(email.html).toContain("https://x/manage/1?a=1&amp;b=2");
  });

  it("says plainly whether a cancellation is refunded", () => {
    const refunded = renderEmail("booking.cancelled", { ...base, partial: false, seatsCancelled: 2, refundLabel: "₹998", manageUrl: null });
    expect(refunded.text).toContain("Refund: ₹998");
    const late = renderEmail("booking.cancelled", { ...base, partial: true, seatsCancelled: 1, refundLabel: null, manageUrl: "https://x/m" });
    expect(late.subject).toBe("1 driver removed from your booking · RS4V-7K2M9Q");
    expect(late.text).toContain("No refund applies.");
  });

  it("escapes every special character", () => {
    expect(escapeHtml(`a&b<c>"d'`)).toBe("a&amp;b&lt;c&gt;&quot;d&#39;");
  });
});
