import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { StaffRole } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";

export type StaffSession = { id: string; email: string; name: string; role: StaffRole };

/** Supabase client bound to the request's cookies. Uses the publishable key: it acts as the signed-in user. */
export async function supabaseServer() {
  const store = await cookies();
  const env = serverEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components can't set cookies; the proxy refreshes them instead.
        }
      },
    },
  });
}

/** The signed-in staff member, or null. A disabled account counts as signed out. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const profile = await db.staffProfile.findUnique({
    where: { id: data.user.id },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (!profile || !profile.active) return null;
  return { id: profile.id, email: profile.email, name: profile.name, role: profile.role };
}

/** For pages: sends anyone without a staff account to the login screen. */
export async function requireStaff(returnTo?: string): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`);
  return session;
}

export async function requireOwner(): Promise<StaffSession> {
  const session = await requireStaff();
  if (session.role !== "OWNER") redirect("/staff");
  return session;
}

/** For API routes: returns the session or a 401/403 response. */
export async function staffApiSession(options: { owner?: boolean } = {}): Promise<{ session: StaffSession } | { response: Response }> {
  const session = await getStaffSession();
  if (!session) return { response: Response.json({ error: "Please sign in again." }, { status: 401 }) };
  if (options.owner && session.role !== "OWNER") return { response: Response.json({ error: "Only the owner can do that." }, { status: 403 }) };
  return { session };
}

export async function touchLastLogin(id: string) {
  await db.staffProfile.update({ where: { id }, data: { lastLoginAt: new Date() } }).catch(() => {});
}
