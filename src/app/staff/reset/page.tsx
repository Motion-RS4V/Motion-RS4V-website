import type { Metadata } from "next";
import { StaffResetForm } from "@/components/staff/StaffResetForm";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false, follow: false } };

/** Opened from the reset email: Supabase puts a one-time code in the URL, which the form exchanges. */
export default function StaffResetPage() {
  return <StaffResetForm />;
}
