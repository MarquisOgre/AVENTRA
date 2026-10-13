import "dotenv/config";
import pino from "pino";
import { createDatabasePool } from "../db/pool.js";
import { bootstrapInitialAdmin } from "./bootstrap-admin.js";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!connectionString || !email) {
    throw new Error("DATABASE_URL and BOOTSTRAP_ADMIN_EMAIL are required.");
  }

  const pool = createDatabasePool({ connectionString });
  try {
    const result = await bootstrapInitialAdmin(pool, email);
    if (result.status === "promoted") {
      logger.info({ userId: result.userId }, "Initial administrator provisioned");
      return;
    }
    if (result.status === "already_configured") {
      throw new Error("An administrator role already exists; refusing bootstrap.");
    }
    throw new Error("No registered account matches BOOTSTRAP_ADMIN_EMAIL.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Administrator bootstrap failed");
  process.exitCode = 1;
});
