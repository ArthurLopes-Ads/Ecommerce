import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before running migrations.");
}

const pool = new Pool({ connectionString, max: 1 });
const migrationsDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of files) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);

      if (applied.rowCount === 0) {
        const sql = await readFile(path.join(migrationsDirectory, name), "utf8");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        console.info(`Applied migration ${name}`);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
