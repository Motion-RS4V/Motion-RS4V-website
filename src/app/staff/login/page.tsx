import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StaffLoginForm } from "@/components/staff/StaffLoginForm";
import { getStaffSession } from "@/server/staff/session";

export const metadata: Metadata = { title: "Staff sign in", robots: { index: false, follow: false } };

export default async function StaffLoginPage(props: PageProps<"/staff/login">) {
  const { next } = await props.searchParams;
  if (await getStaffSession()) redirect(typeof next === "string" && next.startsWith("/staff") ? next : "/staff");
  return <StaffLoginForm next={typeof next === "string" ? next : undefined} />;
}
