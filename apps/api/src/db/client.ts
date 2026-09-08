import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "./schema.js";

export type KeptDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  readonly db: KeptDatabase;
  readonly pool: Pool;
  close(): Promise<void>;
}

export function connectDatabase(connectionString: string): DatabaseConnection {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: () => pool.end(),
  };
}
