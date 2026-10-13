import "dotenv/config";
import pino from "pino";
import { createDatabasePool } from "./pool.js";
import { runMigrations } from "./migrations.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  logger.error("DATABASE_URL is required to run migrations.");
  process.exitCode = 1;
} else {
  const pool = createDatabasePool({ connectionString });
  try {
    const applied = await runMigrations(pool);
    logger.info({ appliedCount: applied.length, migrations: applied }, "Database migrations complete");
  } catch (error) {
    logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Database migrations failed");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
