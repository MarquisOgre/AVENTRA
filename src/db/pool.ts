import { Pool } from "pg";

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

/** Creates a bounded pool. Callers own and must close the returned pool. */
export function createDatabasePool(options: DatabaseOptions): Pool {
  if (!options.connectionString.trim()) {
    throw new Error("DATABASE_URL is required to create a database pool.");
  }

  return new Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    application_name: "aventra",
  });
}
