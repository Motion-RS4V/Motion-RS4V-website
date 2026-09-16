import type { Metadata } from "next";
import { FindBookingForm } from "@/components/flow/FindBookingForm";
import { FlowHeading, FlowShell } from "@/components/flow/FlowShell";

export const metadata: Metadata = { title: "Find My Booking", robots: { index: false } };

export default function FindBookingPage() {
  return (
    <FlowShell>
      <FlowHeading eyebrow="Find my booking" title="Get your booking link.">
        <p>
          Enter the mobile number or email you booked with. We&apos;ll email you a private link to view, move or cancel your upcoming bookings.
        </p>
      </FlowHeading>
      <FindBookingForm />
    </FlowShell>
  );
}
