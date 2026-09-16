import { jsonOk } from "@/server/http";
import { supabaseServer } from "@/server/staff/session";

export async function POST() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return jsonOk({ signedOut: true });
}
