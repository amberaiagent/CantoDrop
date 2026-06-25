import pg from "pg";

// Numeric columns come back from pg as strings by default to avoid float
// precision loss. We keep that behavior — token amounts can exceed 2^53 — and
// let the client/bot treat them as exact decimal strings.

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err);
});

export async function query(text, params) {
  return pool.query(text, params);
}
