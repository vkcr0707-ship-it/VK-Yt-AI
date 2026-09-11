import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@/db";
import { sql } from "drizzle-orm";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;

  const result = await pool.query(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  `);

  if (result.rowCount === 0) {
    await migrate(db, { migrationsFolder: "./drizzle" });
  }

  await db.execute(sql`SELECT 1 FROM "users" LIMIT 1`);
}
