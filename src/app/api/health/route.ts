import { db } from "@/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1 from "users" limit 1`);
    return Response.json({ ok: true, database: "ready" });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 500 });
  }
}
