import { z } from "zod";
import { db } from "@/server/db";
import { handleRouteError, jsonOk, readJson } from "@/server/http";
import { releaseCheckout } from "@/server/payments";

const bodySchema = z.object({ orderId: z.string().regex(/^order_[A-Za-z0-9]+$/) });

/** Frees held seats when the customer backs out of payment. Only unpaid holds can be released. */
export async function POST(request: Request) {
  const parsed = await readJson(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  try {
    return jsonOk({ released: await releaseCheckout(db, parsed.data.orderId) });
  } catch (error) {
    return handleRouteError(error, "release checkout");
  }
}
