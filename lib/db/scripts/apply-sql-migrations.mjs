import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const migrationUrl = new URL("../migrations/0001_append_only_production_audit.sql", import.meta.url);
const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log("Applied append-only production audit migration");
} finally {
  await pool.end();
}