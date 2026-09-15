import type { Metadata } from "next";
import { ComingSoon } from "@/components/site/ComingSoon";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

// Step 4 replaces this with the checkout: driver details, seat hold, Razorpay payment and confirmation.
export default function BookPage() {
  return (
    <ComingSoon
      eyebrow="Checkout"
      title="Checkout is almost ready."
      body="Your session choice worked. Online payment and confirmation are being connected next, so bookings can't be completed here just yet."
    />
  );
}
