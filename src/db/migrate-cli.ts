import "dotenv/config";
import pino from "pino";
import { createDatabasePool } from "./pool.js";
import { runMigrations } from "./migrations.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const pool = createDatabasePool({ connectionString });
  try {
    const applied = await runMigrations(pool);
    logger.info({ appliedCount: applied.length, migrations: applied }, "Database migrations complete");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Database migrations failed");
  process.exitCode = 1;
});
