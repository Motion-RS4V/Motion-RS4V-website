import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { pairKioskDevice } from "@/server/kiosk/devices";

/**
 * Opened once on the screen itself, from the link the owner creates in the console.
 * Sets the device cookie and sends the screen to the kiosk, so the token never stays in the address bar.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const paired = await pairKioskDevice(db, token);
  redirect(paired ? "/kiosk" : "/kiosk?pairing=failed");
}
