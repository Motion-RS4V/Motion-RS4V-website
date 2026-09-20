import { z } from "zod";
import { db } from "@/server/db";
import { jsonError, jsonOk, readJson } from "@/server/http";
import { handleRouteError } from "@/server/http";
import { currentKioskDevice } from "@/server/kiosk/devices";
import { CheckoutError, paymentGateway, startCheckout } from "@/server/payments";
import { hitRateLimit } from "@/server/rate-limit";
import { loadSettings } from "@/server/settings";

const bodySchema = z.object({
  start: z.iso.datetime({ error: "Pick a session time." }),
  seats: z
    .array(z.object({ experienceCode: z.string().min(1).max(40), driverName: z.string().trim().max(60).nullish() }))
    .min(1, { error: "Choose at least one driver." })
    .max(12),
  customer: z.object({
    name: z.string().trim().min(1, { error: "Enter a name." }).max(80),
    phone: z.string().trim().min(6, { error: "Enter a mobile number." }).max(20),
  }),
});

/**
 * Holds seats and opens a Razorpay order for the screen at the counter.
 * Separate from /api/checkout because only a paired screen may sell this late into a session.
 */
export async function POST(request: Request) {
  const device = await currentKioskDevice(db);
  if (!device) return jsonError(403, "This screen isn't set up. Please ask at the desk.", { code: "KIOSK_NOT_PAIRED" });

  const settings = await loadSettings(db);
  if (!settings.kiosk.enabled) return jsonError(403, "Booking on this screen is switched off. Please ask at the desk.", { code: "KIOSK_OFF" });

  // Generous: a busy counter sells often from one screen, but a stuck loop still stops.
  const limit = await hitRateLimit(db, `kiosk:${device.id}`, 40, 600);
  if (!limit.allowed) return jsonError(429, "Too many attempts on this screen. Please ask at the desk.");

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { start, seats, customer } = parsed.data;

  try {
    const checkout = await startCheckout(db, paymentGateway(), {
      channel: "KIOSK",
      slotStart: new Date(start),
      seats: seats.map((s) => ({ experienceCode: s.experienceCode, driverName: s.driverName ?? null })),
      customer: { name: customer.name, phone: customer.phone },
      // Terms are shown on the screen and accepted by paying; there is no email address to send a copy to.
      termsAcceptedAt: new Date(),
      attribution: { utmSource: "kiosk", utmMedium: "venue", deviceType: "kiosk" },
    });
    return jsonOk({ ...checkout, prefill: { name: customer.name, email: "", contact: customer.phone } });
  } catch (error) {
    if (error instanceof CheckoutError) return jsonError(503, error.message, { code: error.code });
    return handleRouteError(error, "kiosk checkout");
  }
}
