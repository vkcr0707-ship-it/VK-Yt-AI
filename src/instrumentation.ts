import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;

  await migrate(db, { migrationsFolder: "./drizzle" });

  await db.execute(sql`SELECT 1 FROM "users" LIMIT 1`);
}
