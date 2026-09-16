import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_SETTINGS } from "./defaults";
import { SETTINGS_KEYS, settingsSchemas, type Settings, type SettingsKey } from "./schema";

export type SettingsIssue = { path: string; message: string };

export class InvalidSettingsError extends Error {
  readonly issues: string[];

  constructor(
    readonly key: SettingsKey,
    /** Paths are relative to the group, e.g. "weeklyHours.mon.closesAt", so a form can mark the field. */
    readonly fieldIssues: SettingsIssue[],
  ) {
    const issues = fieldIssues.map((i) => `${i.path || key}: ${i.message}`);
    super(`Settings group "${key}" is invalid: ${issues.join("; ")}`);
    this.name = "InvalidSettingsError";
    this.issues = issues;
  }
}

type SettingRow = { key: string; value: unknown };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validate<K extends SettingsKey>(key: K, candidate: unknown): Settings[K] {
  const parsed = settingsSchemas[key].safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidSettingsError(
      key,
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data as Settings[K];
}

/**
 * Stored values win over defaults field by field, so adding a new setting later
 * doesn't require a data migration. An invalid stored group throws rather than
 * silently falling back: a wrong price or policy must never reach a customer.
 */
export function resolveSettings(rows: SettingRow[]): Settings {
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingsKey, unknown>;
  for (const key of SETTINGS_KEYS) {
    const value = stored.get(key);
    const candidate = isPlainObject(value) ? { ...DEFAULT_SETTINGS[key], ...value } : DEFAULT_SETTINGS[key];
    out[key] = validate(key, candidate);
  }
  return out as Settings;
}

export async function loadSettings(client: Pick<PrismaClient, "setting">): Promise<Settings> {
  const rows = await client.setting.findMany({ select: { key: true, value: true } });
  return resolveSettings(rows);
}

/** Replace one settings group. Validates first, and records before/after in the audit log. */
export async function updateSettings<K extends SettingsKey>(
  client: PrismaClient,
  key: K,
  value: Settings[K],
  actorId: string | null,
): Promise<Settings[K]> {
  const next = validate(key, value);
  const json = next as unknown as Prisma.InputJsonValue;

  return client.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key } });
    await tx.setting.upsert({
      where: { key },
      create: { key, value: json, updatedById: actorId },
      update: { value: json, updatedById: actorId },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "settings.update",
        entityType: "settings",
        entityId: key,
        before: (before?.value ?? undefined) as Prisma.InputJsonValue | undefined,
        after: json,
      },
    });
    return next;
  });
}
