import { Pool, QueryResult, QueryResultRow } from "pg";

const globalForDb = global as unknown as { pool: Pool | undefined };

const envDatabaseUrl = process.env.DATABASE_URL;
if (!envDatabaseUrl) {
  throw new Error("DATABASE_URL is not set");
}
const databaseUrl: string = envDatabaseUrl;

function createPool(): Pool {
  return new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=") ? undefined : true,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    allowExitOnIdle: true,
    keepAlive: true,
  });
}

export const pool = globalForDb.pool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

function isRetryableDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: string }).message ?? "").toLowerCase();
  const code = String((error as { code?: string }).code ?? "");

  return (
    code === "57P01" ||
    code === "ECONNRESET" ||
    message.includes("connection terminated") ||
    message.includes("connection timeout") ||
    message.includes("terminating connection")
  );
}

export async function queryWithRetry<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: any[],
  retries = 1,
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, values);
  } catch (error) {
    if (retries > 0 && isRetryableDbError(error)) {
      return queryWithRetry<T>(text, values, retries - 1);
    }
    throw error;
  }
}
