import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { newDb } from "pg-mem";

config();

const databaseUrl = process.env.DATABASE_URL;

export type DatabaseConnectionMetadata = { host: string; port: string; database: string };

export function databaseConnectionMetadata(): DatabaseConnectionMetadata {
  if (!databaseUrl) return { host: "unavailable", port: "unavailable", database: "unavailable" };
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname || "unavailable",
      port: url.port || "5432",
      database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "unavailable",
    };
  } catch {
    return { host: "unavailable", port: "unavailable", database: "unavailable" };
  }
}

function errorRecord(error: unknown): Record<string, unknown> {
  return error && typeof error === "object" ? error as Record<string, unknown> : {};
}

function sanitizeDatabaseText(value: unknown): string {
  return String(value ?? "unavailable")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted-database-url]")
    .replace(/\s+/g, " ")
    .slice(0, 1000);
}

export function formatDatabaseError(error: unknown): string {
  const outer = errorRecord(error);
  const cause = errorRecord(outer.cause);
  const source = cause.message || cause.code || cause.detail || cause.hint ? cause : outer;
  const metadata = databaseConnectionMetadata();
  const code = sanitizeDatabaseText(source.code ?? outer.code);
  const message = sanitizeDatabaseText(source.message ?? outer.message ?? error);
  const detail = sanitizeDatabaseText(source.detail);
  const hint = sanitizeDatabaseText(source.hint);
  return `Database error: host=${metadata.host} port=${metadata.port} database=${metadata.database} code=${code} message=${message} detail=${detail} hint=${hint}`;
}

if (!databaseUrl && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL is required in production");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function createPool(): Pool {
  if (databaseUrl) {
    return new Pool({ connectionString: databaseUrl });
  }

  const memDb = newDb();
  const { Pool: MemPool } = memDb.adapters.createPg();
  return new MemPool() as unknown as Pool;
}

export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
