/**
 * Fails if any table in the public schema has row-level security switched off.
 * Supabase exposes that schema through its Data API, so every new migration must keep RLS on.
 *
 *   npm run db:check-rls
 */
import "./load-env";

import { db } from "@/server/db";

async function main() {
  const open = await db.$queryRaw<{ table: string }[]>`
    select c.relname as "table"
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    order by 1`;

  if (open.length) {
    console.error(`Row-level security is OFF for: ${open.map((t) => t.table).join(", ")}`);
    console.error("Add `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;` to the migration.");
    process.exitCode = 1;
  } else {
    console.log("Row-level security is on for every public table.");
  }
}

main().finally(() => db.$disconnect());
