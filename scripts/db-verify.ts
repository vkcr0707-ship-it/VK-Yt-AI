import "dotenv/config";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { getTableConfig } from "drizzle-orm/pg-core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for db:verify");
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

type ExpectedTable = { name: string; columns: string[] };
const expectedTables: ExpectedTable[] = tableExports.map((tableExport) => {
  const table = schema[tableExport];
  const config = getTableConfig(table);
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

async function main() {
  try {
    const result = await pool.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [expectedTables.map((table) => table.name)]);
  const actual = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const columns = actual.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    actual.set(row.table_name, columns);
  }

  const missing: string[] = [];
  for (const table of expectedTables) {
    const columns = actual.get(table.name);
    if (!columns) {
      missing.push(`table ${table.name}`);
      continue;
    }
    for (const column of table.columns) {
      if (!columns.has(column)) missing.push(`column ${table.name}.${column}`);
    }
  }

    if (missing.length > 0) {
      console.error("Database schema drift detected:");
      for (const item of missing) console.error(`- missing ${item}`);
      process.exitCode = 1;
    } else {
      console.log(`Database schema verified: ${expectedTables.length} tables and all declared columns present.`);
    }
  } catch (error) {
    console.error("Database verification failed:", safeError(error));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
