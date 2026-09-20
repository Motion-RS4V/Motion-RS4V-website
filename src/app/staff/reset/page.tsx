import type { Metadata } from "next";
import { StaffResetForm } from "@/components/staff/StaffResetForm";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false, follow: false } };

/** Opened from a reset link (emailed, or handed out by the owner): the one-time token is spent when the new password is saved. */
export default async function StaffResetPage(props: PageProps<"/staff/reset">) {
  const { token_hash } = await props.searchParams;
  return <StaffResetForm tokenHash={typeof token_hash === "string" ? token_hash : null} />;
}
