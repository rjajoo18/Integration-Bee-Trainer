// src/lib/db.ts
import { Pool } from "pg";

// This checks if we are in production to avoid creating too many connections during hot-reloads
const globalForDb = global as unknown as { pool: Pool };

export const pool =
  globalForDb.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: true, // 👈 FIXES ECONNRESET: Required for Neon
    max: 1,    // 👈 FIXES TIMEOUTS: Limits connections for serverless
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;