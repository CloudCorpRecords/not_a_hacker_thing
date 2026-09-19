import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const migrationUrls = [
  new URL("../migrations/0001_append_only_production_audit.sql", import.meta.url),
  new URL("../migrations/0002_append_only_evidence_audit.sql", import.meta.url),
];
const sql = (await Promise.all(migrationUrls.map((url) => readFile(fileURLToPath(url), "utf8")))).join("\n");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log("Applied append-only production and evidence audit migrations");
} finally {
  await pool.end();
}