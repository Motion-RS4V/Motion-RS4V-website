import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/server/http";
import { saveSettingsGroup } from "@/server/owner/settings";
import { ScheduleConflictError } from "@/server/owner/errors";
import { InvalidSettingsError, SETTINGS_KEYS } from "@/server/settings";
import { staffApiSession } from "@/server/staff/session";

const bodySchema = z.object({
  key: z.enum(SETTINGS_KEYS as [string, ...string[]]),
  value: z.record(z.string(), z.unknown()),
});

/** Replaces one settings group. Owner only. */
export async function PUT(request: Request) {
  const auth = await staffApiSession({ owner: true });
  if ("response" in auth) return auth.response;

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const key = parsed.data.key as (typeof SETTINGS_KEYS)[number];

  try {
    const saved = await saveSettingsGroup(db, { key, value: parsed.data.value, actorId: auth.session.id });
    // Prices, hours and policy show up on every public page, so drop all cached renders.
    revalidatePath("/", "layout");
    return jsonOk({ key, value: saved });
  } catch (error) {
    if (error instanceof InvalidSettingsError) {
      return jsonError(400, error.fieldIssues[0]?.message ?? "Some values aren't valid.", { issues: error.fieldIssues });
    }
    if (error instanceof ScheduleConflictError) {
      const n = error.stranded.length;
      return jsonError(
        409,
        `${n} upcoming ${n === 1 ? "booking doesn't" : "bookings don't"} fit the new schedule. Move or cancel ${n === 1 ? "it" : "them"} first, then save again.`,
        { stranded: error.stranded.slice(0, 10) },
      );
    }
    return handleRouteError(error, `owner settings ${key}`);
  }
}
