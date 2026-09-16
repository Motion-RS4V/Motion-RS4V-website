import "server-only";

import { randomBytes } from "node:crypto";
import type { PrismaClient, StaffRole } from "@/generated/prisma/client";
import { serverEnv } from "@/server/env";
import { supabaseAdmin } from "@/server/supabase/admin";
import { OwnerError } from "./errors";

type Db = PrismaClient;

export type StaffAccount = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

const SELECT = { id: true, email: true, name: true, role: true, active: true, lastLoginAt: true, createdAt: true } as const;

export async function listStaff(db: Db): Promise<StaffAccount[]> {
  return db.staffProfile.findMany({ orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }], select: SELECT });
}

async function findAuthUserId(email: string): Promise<string | undefined> {
  const admin = supabaseAdmin();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return undefined;
  }
}

/**
 * A one-time link that lets the person choose their own password.
 * Built from a hashed token, not Supabase's redirect flow, so it works on whichever phone or computer opens it.
 */
export async function passwordSetupLink(email: string): Promise<string> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "recovery", email });
  if (error || !data.properties?.hashed_token) throw new OwnerError("Couldn't create a sign-in link. Try again in a minute.", 502);
  const site = serverEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return `${site}/staff/reset?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
}

/**
 * Adds someone to the console. Their login gets a random password nobody knows;
 * the owner passes on the setup link so they choose their own.
 */
export async function addStaff(
  db: Db,
  input: { email: string; name: string; role: StaffRole; actorId: string },
): Promise<{ account: StaffAccount; setupLink: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw new OwnerError("Enter their name.");

  const existing = await db.staffProfile.findUnique({ where: { email }, select: { id: true, active: true } });
  if (existing) {
    throw new OwnerError(existing.active ? "That email already has a console account." : "That email has a turned-off account. Turn it back on instead.", 409);
  }

  let id = await findAuthUserId(email);
  if (!id) {
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password: randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data.user) throw new OwnerError(error?.message ?? "Couldn't create the login.", 502);
    id = data.user.id;
  }

  const account = await db.staffProfile.create({ data: { id, email, name, role: input.role }, select: SELECT });
  await db.auditLog.create({
    data: { actorId: input.actorId, action: "staff.add", entityType: "staff", entityId: id, after: { email, name, role: input.role } },
  });
  return { account, setupLink: await passwordSetupLink(email) };
}

/**
 * Changes name, role or whether the account can sign in. A turned-off account is signed out on its next request.
 * The venue always keeps at least one active owner, and owners can't lock themselves out.
 */
export async function updateStaff(
  db: Db,
  input: { staffId: string; name?: string; role?: StaffRole; active?: boolean; actorId: string },
): Promise<StaffAccount> {
  const before = await db.staffProfile.findUnique({ where: { id: input.staffId }, select: SELECT });
  if (!before) throw new OwnerError("That account doesn't exist.", 404);

  const role = input.role ?? before.role;
  const active = input.active ?? before.active;
  const name = input.name?.trim() ?? before.name;
  if (!name) throw new OwnerError("Enter their name.");

  const losesOwner = before.role === "OWNER" && before.active && (role !== "OWNER" || !active);
  if (losesOwner && input.staffId === input.actorId) {
    throw new OwnerError("You can't remove your own owner access. Ask another owner to do it.", 409);
  }

  return db.$transaction(async (tx) => {
    // Serialise owner changes so two owners removing each other at once can't leave the venue with none.
    await tx.$queryRaw`select 1 as locked from (select pg_advisory_xact_lock(hashtextextended('rs4v:owners', 0))) as l`;
    if (losesOwner) {
      const owners = await tx.staffProfile.count({ where: { role: "OWNER", active: true } });
      if (owners <= 1) throw new OwnerError("The venue needs at least one active owner.", 409);
    }
    const account = await tx.staffProfile.update({ where: { id: input.staffId }, data: { name, role, active }, select: SELECT });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "staff.update",
        entityType: "staff",
        entityId: input.staffId,
        before: { name: before.name, role: before.role, active: before.active },
        after: { name, role, active },
      },
    });
    return account;
  });
}

/** A fresh setup link for someone who forgot their password or never used the first one. */
export async function resetStaffPassword(db: Db, input: { staffId: string; actorId: string }): Promise<string> {
  const account = await db.staffProfile.findUnique({ where: { id: input.staffId }, select: { email: true, active: true } });
  if (!account) throw new OwnerError("That account doesn't exist.", 404);
  if (!account.active) throw new OwnerError("Turn the account on first.", 409);
  const link = await passwordSetupLink(account.email);
  await db.auditLog.create({ data: { actorId: input.actorId, action: "staff.reset_link", entityType: "staff", entityId: input.staffId, after: {} } });
  return link;
}
