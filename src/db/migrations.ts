import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../db/migrations/", import.meta.url),
);

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

/** Applies unapplied SQL migrations in filename order and detects edited history. */
export async function runMigrations(
  pool: Pool,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
): Promise<string[]> {
  const names = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
    .sort();

  const migrations: MigrationFile[] = await Promise.all(names.map(async (name) => {
    const sql = await readFile(join(migrationsDirectory, name), "utf8");
    return {
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    };
  }));

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const applied: string[] = [];
  for (const migration of migrations) {
    const existing = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [migration.name],
    );
    const prior = existing.rows[0];

    if (prior) {
      if (prior.checksum !== migration.checksum) {
        throw new Error(`Applied migration was modified: ${migration.name}`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Migration files are trusted, version-controlled SQL, never user input.
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      await client.query("COMMIT");
      applied.push(migration.name);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return applied;
}
