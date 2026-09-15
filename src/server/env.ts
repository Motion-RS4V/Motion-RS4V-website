import { z } from "zod";

/** Server-side environment. Secrets and connection details only; business values live in `settings`. */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://", "DATABASE_URL must be a postgresql:// connection string"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_"),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // List variable names only; never echo values.
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Missing or invalid environment variables: ${names.join(", ")}. Check .env.local.`);
  }
  cached = parsed.data;
  return cached;
}
