import { z } from "zod";

/**
 * Server-side environment. Secrets and connection details only; business values live in `settings`.
 * Each area validates its own variables, so a page that never takes payments doesn't need payment keys.
 */

function load<T extends z.ZodTypeAny>(schema: T, area: string): z.infer<T> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // List variable names only; never echo values.
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`${area}: missing or invalid environment variables: ${names.join(", ")}. Check .env.local.`);
  }
  return parsed.data;
}

const coreSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://", "DATABASE_URL must be a postgresql:// connection string"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_"),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

const paymentsSchema = z.object({
  RAZORPAY_KEY_ID: z.string().regex(/^rzp_(test|live)_/, "RAZORPAY_KEY_ID must start with rzp_test_ or rzp_live_"),
  RAZORPAY_KEY_SECRET: z.string().min(10),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(""),
});

const emailSchema = z.object({
  EMAIL_PROVIDER: z.enum(["resend", "ses", "console"]).default("console"),
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().optional().default(""),
});

const jobsSchema = z.object({
  CRON_SECRET: z.string().min(24, "CRON_SECRET must be at least 24 characters"),
});

export type ServerEnv = z.infer<typeof coreSchema>;
export type PaymentsEnv = z.infer<typeof paymentsSchema>;
export type EmailEnv = z.infer<typeof emailSchema>;

let core: ServerEnv | undefined;
let payments: PaymentsEnv | undefined;
let email: EmailEnv | undefined;

export function serverEnv(): ServerEnv {
  return (core ??= load(coreSchema, "Server"));
}

export function paymentsEnv(): PaymentsEnv {
  return (payments ??= load(paymentsSchema, "Payments"));
}

export function emailEnv(): EmailEnv {
  return (email ??= load(emailSchema, "Email"));
}

export function jobsEnv() {
  return load(jobsSchema, "Scheduled jobs");
}
