import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "../env";

/**
 * Supabase client with the secret key. Server only: it bypasses row-level security.
 * Used for staff account management (create, disable, reset password).
 */
export function supabaseAdmin() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
