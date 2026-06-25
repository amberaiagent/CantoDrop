// Applies db/schema.sql to the configured database. Idempotent (uses IF NOT EXISTS).
// Run with: npm run db:init
import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { pool } from "../db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");

try {
  await pool.query(schema);
  console.log("✓ schema applied to", process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ":****@"));
} catch (err) {
  console.error("✗ failed to apply schema:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
