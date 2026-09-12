ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'queued';
