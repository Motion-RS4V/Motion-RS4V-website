import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { clientIp, jsonError, jsonOk, readJson } from "@/server/http";
import { sendManageLinks } from "@/server/manage/service";
import { hitRateLimit } from "@/server/rate-limit";

const bodySchema = z.object({ contact: z.string().trim().min(5, { error: "Enter the mobile number or email you booked with." }).max(120) });

const GENERIC = "If we found an upcoming booking, we've emailed a link to the address on it. It can take a minute to arrive.";

/** Emails fresh manage links. Always answers the same way, so it can't be used to discover who has booked. */
export async function POST(request: Request) {
  const ip = await hitRateLimit(db, `find:ip:${clientIp(request.headers)}`, 5, 15 * 60);
  if (!ip.allowed) return jsonError(429, "Too many lookups from this connection. Please try again in a few minutes.");

  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const contactKey = createHash("sha256").update(parsed.data.contact.toLowerCase()).digest("hex").slice(0, 32);
  const perContact = await hitRateLimit(db, `find:contact:${contactKey}`, 3, 60 * 60);
  if (perContact.allowed) {
    try {
      await sendManageLinks(db, parsed.data.contact);
    } catch (error) {
      console.error("find booking failed", error);
    }
  }
  return jsonOk({ message: GENERIC });
}
