import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { InvalidSettingsError, loadSettings, settingsSchemas, updateSettings, type Settings, type SettingsKey } from "@/server/settings";
import { assertNoStrandedBookings } from "./schedule-guard";

/**
 * Saves one settings group from the owner console.
 * - The venue timezone is kept as stored: changing it would silently shift every booked session.
 * - A schedule that would strand upcoming bookings is refused until they're moved or cancelled.
 */
export async function saveSettingsGroup<K extends SettingsKey>(
  db: PrismaClient,
  input: { key: K; value: unknown; actorId: string; now?: Date },
): Promise<Settings[K]> {
  const now = input.now ?? new Date();
  const current = await loadSettings(db);

  let candidate = input.value;
  if (input.key === "venue" && typeof candidate === "object" && candidate !== null) {
    candidate = { ...candidate, timezone: current.venue.timezone };
  }

  const parsed = settingsSchemas[input.key].safeParse(candidate);
  if (!parsed.success) {
    throw new InvalidSettingsError(
      input.key,
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const value = parsed.data as Settings[K];

  if (input.key === "schedule") {
    await assertNoStrandedBookings(db, { schedule: value as Settings["schedule"], timezone: current.venue.timezone, now });
  }

  return updateSettings(db, input.key, value, input.actorId);
}
