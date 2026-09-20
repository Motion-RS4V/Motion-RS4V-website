import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocalDate } from "@/server/booking";
import { db } from "@/server/db";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/server/http";
import { OwnerError, ScheduleConflictError } from "@/server/owner/errors";
import { createCar, createRig, moveRig, updateCar, updateRig } from "@/server/owner/fleet";
import { removeOverride, saveOverride } from "@/server/owner/overrides";
import { createKioskDevice, revokeKioskDevice } from "@/server/kiosk/devices";
import { addStaff, resetStaffPassword, updateStaff } from "@/server/owner/staff-accounts";
import { staffApiSession } from "@/server/staff/session";

const uuid = z.uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time, like 10:00.");
const date = z.string().refine(isLocalDate, "Pick a date.");
const label = z.string().trim().min(1, "Give it a name.").max(40);
const notes = z.string().trim().max(200).nullish();
const role = z.enum(["OWNER", "MANAGER", "STAFF"]);

/** Owner-only changes that aren't a settings group: special dates, fleet records, staff accounts. */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("override-save"), date, closed: z.boolean(), opensAt: time.nullish(), closesAt: time.nullish(), note: z.string().trim().max(120).nullish() }),
  z.object({ action: z.literal("override-remove"), date }),

  z.object({ action: z.literal("rig-create"), label, notes }),
  z.object({ action: z.literal("rig-update"), rigId: uuid, label, notes }),
  z.object({ action: z.literal("rig-move"), rigId: uuid, direction: z.enum(["up", "down"]) }),
  z.object({ action: z.literal("car-create"), label, experienceCode: z.string().min(1).max(40), notes }),
  z.object({ action: z.literal("car-update"), carId: uuid, label, notes }),

  z.object({ action: z.literal("staff-add"), email: z.email({ error: "Enter a valid email." }).max(120), name: z.string().trim().min(1, "Enter their name.").max(80), role }),
  z.object({ action: z.literal("staff-update"), staffId: uuid, name: z.string().trim().min(1).max(80).optional(), role: role.optional(), active: z.boolean().optional() }),
  z.object({ action: z.literal("staff-reset"), staffId: uuid }),

  z.object({ action: z.literal("kiosk-add"), label }),
  z.object({ action: z.literal("kiosk-revoke"), deviceId: uuid }),
]);

export async function POST(request: Request) {
  const auth = await staffApiSession({ owner: true });
  if ("response" in auth) return auth.response;
  const actorId = auth.session.id;

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    switch (body.action) {
      case "override-save": {
        const saved = await saveOverride(db, { ...body, actorId });
        revalidatePath("/", "layout"); // opening hours show on the public site
        return jsonOk(saved);
      }
      case "override-remove":
        await removeOverride(db, { date: body.date, actorId });
        revalidatePath("/", "layout");
        return jsonOk({ ok: true });

      case "rig-create":
        return jsonOk(await createRig(db, { ...body, actorId }));
      case "rig-update":
        return jsonOk(await updateRig(db, { ...body, actorId }));
      case "rig-move":
        await moveRig(db, { ...body, actorId });
        return jsonOk({ ok: true });
      case "car-create":
        return jsonOk(await createCar(db, { ...body, actorId }));
      case "car-update":
        return jsonOk(await updateCar(db, { ...body, actorId }));

      case "staff-add":
        return jsonOk(await addStaff(db, { ...body, actorId }));
      case "staff-update":
        return jsonOk(await updateStaff(db, { ...body, actorId }));
      case "kiosk-add":
        return jsonOk(await createKioskDevice(db, { label: body.label, actorId }));

      case "kiosk-revoke":
        await revokeKioskDevice(db, { deviceId: body.deviceId, actorId });
        return jsonOk({ ok: true });

      case "staff-reset":
        return jsonOk({ setupLink: await resetStaffPassword(db, { staffId: body.staffId, actorId }) });
    }
  } catch (error) {
    if (error instanceof OwnerError) return jsonError(error.status, error.message);
    if (error instanceof ScheduleConflictError) {
      const n = error.stranded.length;
      return jsonError(409, `${n} ${n === 1 ? "booking doesn't" : "bookings don't"} fit those hours. Move or cancel ${n === 1 ? "it" : "them"} first.`, {
        stranded: error.stranded.slice(0, 10),
      });
    }
    return handleRouteError(error, `owner ${body.action}`);
  }
}
