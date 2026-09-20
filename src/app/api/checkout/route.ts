import { z } from "zod";
import { db } from "@/server/db";
import { clientIp, deviceType, handleRouteError, jsonError, jsonOk, readJson } from "@/server/http";
import { CheckoutError, paymentGateway, startCheckout } from "@/server/payments";
import { hitRateLimit } from "@/server/rate-limit";
import { loadSettings } from "@/server/settings";

const optionalText = (max: number) => z.string().trim().max(max).nullish();

const bodySchema = z.object({
  start: z.iso.datetime({ error: "Pick a session time." }),
  seats: z
    .array(z.object({ experienceCode: z.string().min(1).max(40), driverName: optionalText(60) }))
    .min(1, { error: "Choose at least one driver." })
    .max(12),
  customer: z.object({
    name: z.string().trim().min(1, { error: "Enter the name the booking is under." }).max(80),
    phone: z.string().trim().min(6, { error: "Enter your mobile number." }).max(20),
    email: z.email({ error: "Enter a valid email address. Your confirmation is sent there." }).max(120),
    marketingConsent: z.boolean().optional(),
  }),
  termsAccepted: z.literal(true, { error: "Please accept the booking and cancellation terms." }),
  attribution: z
    .object({
      utmSource: optionalText(100),
      utmMedium: optionalText(100),
      utmCampaign: optionalText(100),
      referrer: optionalText(300),
      landingPath: optionalText(200),
    })
    .partial()
    .optional(),
});

/** Holds seats and opens a Razorpay order. The price comes from the server, never the browser. */
export async function POST(request: Request) {
  const limit = await hitRateLimit(db, `checkout:${clientIp(request.headers)}`, 8, 600);
  if (!limit.allowed) {
    return jsonError(429, "Too many booking attempts from this connection. Please wait a few minutes and try again.");
  }

  // Checked here rather than in the booking engine, so the engine's database tests don't depend on the owner's switch.
  if (!(await loadSettings(db)).policy.onlineBookingEnabled) {
    return jsonError(403, "Online booking is paused right now. Message us on WhatsApp or ask at the desk to book.", { code: "ONLINE_BOOKING_OFF" });
  }

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { start, seats, customer, attribution } = parsed.data;

  try {
    const checkout = await startCheckout(db, paymentGateway(), {
      slotStart: new Date(start),
      seats: seats.map((s) => ({ experienceCode: s.experienceCode, driverName: s.driverName ?? null })),
      customer: { name: customer.name, phone: customer.phone, email: customer.email, marketingConsent: customer.marketingConsent },
      termsAcceptedAt: new Date(),
      attribution: { ...attribution, deviceType: deviceType(request.headers.get("user-agent")) },
    });
    return jsonOk({ ...checkout, prefill: { name: customer.name, email: customer.email, contact: customer.phone } });
  } catch (error) {
    if (error instanceof CheckoutError) return jsonError(503, error.message, { code: error.code });
    return handleRouteError(error, "checkout");
  }
}
