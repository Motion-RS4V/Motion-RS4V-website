import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/ComingSoon";

export const metadata: Metadata = { title: "Find My Booking", robots: { index: false } };

// Step 4 replaces this with lookup by booking reference plus a one-time code.
export default function FindBookingPage() {
  return (
    <ComingSoon
      eyebrow="Find my booking"
      title="Look up a booking."
      body="Finding, moving and cancelling a booking with your reference number arrives together with online checkout."
    />
  );
}
