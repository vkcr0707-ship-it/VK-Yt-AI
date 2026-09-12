import { db } from "@/db";
import * as s from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { runJobNow } from "@/lib/system";

const pollMs = Number(process.env.WORKER_POLL_MS || 2000);
const batchSize = Number(process.env.WORKER_BATCH_SIZE || 1);

async function claimJob(): Promise<string | null> {
  const candidates = await db.select({ id: s.jobs.id }).from(s.jobs).where(eq(s.jobs.status, "queued")).orderBy(asc(s.jobs.createdAt)).limit(batchSize);
  for (const candidate of candidates) {
    const claimed = await db.execute(sql`UPDATE ${s.jobs}
      SET status = 'running', started_at = NOW(), error = ''
      WHERE id = ${candidate.id} AND status = 'queued'
      RETURNING id`);
    if (claimed.rows.length > 0) return candidate.id;
  }
  return null;
}

async function processOnce(): Promise<boolean> {
  const jobId = await claimJob();
  if (!jobId) return false;
  await runJobNow(jobId, { alreadyClaimed: true });
  return true;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the rendering worker");
  if (process.env.WORKER_MODE !== "external") throw new Error("Set WORKER_MODE=external to run the worker process");
  console.log("Worker started; polling queued jobs.");
  for (;;) {
    const processed = await processOnce();
    if (!processed) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
