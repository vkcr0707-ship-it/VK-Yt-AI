import "dotenv/config";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import * as schema from "../src/db/schema";
import { getTableConfig } from "drizzle-orm/pg-core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for db:migrate");
  process.exit(1);
}

const tableExports = [
  "users", "sessions", "channels", "niches", "nicheProfiles", "competitors",
  "referenceVideos", "researchResults", "quotaUsage", "trends", "opportunities",
  "contentIdeas", "scripts", "scriptFacts", "storyboards", "storyboardScenes",
  "assets", "voices", "videoProjects", "editDecisionLists", "renders", "thumbnails",
  "titleOptions", "seoMetadata", "qualityGates", "uploads", "youtubeTokens",
  "analyticsSnapshots", "videoPerformances", "channelMemories", "strategies",
  "contentCalendars", "jobs", "automationSettings", "costRecords",
] as const;

const expectedTables = tableExports.map((tableExport) => {
  const config = getTableConfig(schema[tableExport]);
  return { name: config.name, columns: Object.values(config.columns).map((column) => column.name) };
});

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 5_000,
  allowExitOnIdle: true,
});

function safeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .slice(0, 500);
}

async function schemaIsComplete(): Promise<boolean> {
  const result = await pool.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = ANY($1::text[])
  `, [expectedTables.map((table) => table.name)]);
  const actual = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const columns = actual.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    actual.set(row.table_name, columns);
  }
  return expectedTables.every((table) => {
    const columns = actual.get(table.name);
    return Boolean(columns && table.columns.every((column) => columns.has(column)));
  });
}

async function migrationLedgerState(): Promise<{ exists: boolean; count: number }> {
  const result = await pool.query<{ exists: boolean }>(`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`);
  if (!result.rows[0]?.exists) return { exists: false, count: 0 };
  const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM drizzle.__drizzle_migrations`);
  return { exists: true, count: Number(count.rows[0]?.count ?? 0) };
}

async function adoptVerifiedBaseline(): Promise<void> {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
  await pool.query("BEGIN");
  try {
    for (const [index, entry] of journal.entries.entries()) {
      const migration = migrations[index];
      if (!migration || migration.folderMillis === undefined) throw new Error(`Missing migration ${entry.tag}`);
      await pool.query(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        [migration.hash, migration.folderMillis],
      );
    }
    await pool.query("COMMIT");
    console.log(`Adopted verified migration baseline: ${journal.entries.length} migrations.`);
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  try {
    const state = await migrationLedgerState();
    if (state.exists && state.count === 0 && await schemaIsComplete()) {
      await adoptVerifiedBaseline();
    } else if (state.exists && state.count === 0) {
      throw new Error("Migration ledger is empty but the application schema is incomplete; refusing to guess or overwrite migration history");
    }
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error("Database migration failed:", safeError(error));
  process.exitCode = 1;
});