import type { z } from "zod";
import { BookingError } from "@/server/booking";

/** Best-effort client IP for rate limiting. Behind a proxy the first X-Forwarded-For entry is the visitor. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export function deviceType(userAgent: string | null): "mobile" | "tablet" | "desktop" {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk(body: unknown) {
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

/** Parses a JSON request body against a schema; returns a ready 400 response when it doesn't fit. */
export async function readJson<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "The request body must be JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, response: jsonError(400, first?.message ?? "Some details are missing or invalid.", { field: first?.path.join(".") }) };
  }
  return { ok: true, data: parsed.data };
}

/** Turns known domain errors into customer-safe responses; anything else is logged and hidden. */
export function handleRouteError(error: unknown, context: string) {
  if (error instanceof BookingError) {
    const status = error.code === "BOOKING_NOT_FOUND" ? 404 : error.code === "SLOT_FULL" || error.code === "EXPERIENCE_FULL" ? 409 : 400;
    return jsonError(status, error.message, { code: error.code });
  }
  console.error(`${context} failed`, error);
  return jsonError(500, "Something went wrong on our side. Nothing was charged. Please try again.");
}
