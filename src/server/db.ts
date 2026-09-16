import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "./env";

function createClient() {
  // Supabase's transaction pooler takes plain Postgres connections; the `pgbouncer` flag is a Prisma-ism the pg driver doesn't need.
  const url = new URL(serverEnv().DATABASE_URL);
  url.searchParams.delete("pgbouncer");

  const adapter = new PrismaPg({
    connectionString: url.toString(),
    // TODO(launch): pin Supabase's CA certificate instead of skipping verification.
    ssl: { rejectUnauthorized: false },
    max: 5,
    // Opening a TLS connection to the pooler costs over a second; pg's default closes idle ones after 10s,
    // so every click after a short pause paid that again. Keep them for a few minutes instead.
    idleTimeoutMillis: 5 * 60_000,
    keepAlive: true,
  });
  return new PrismaClient({ adapter });
}

// Reuse one client across hot reloads in development.
const globalForDb = globalThis as unknown as { rs4vDb?: PrismaClient };

export const db = globalForDb.rs4vDb ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.rs4vDb = db;
