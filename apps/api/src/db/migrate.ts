import { fileURLToPath, pathToFileURL } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { connectDatabase } from "./client.js";
import { seedCommitmentCatalogue } from "./seed.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migrateDatabase(connectionString: string): Promise<void> {
  const connection = connectDatabase(connectionString);
  try {
    await migrate(connection.db, { migrationsFolder });
    await seedCommitmentCatalogue(connection.db);
  } finally {
    await connection.close();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to run database migrations");
  }

  await migrateDatabase(connectionString);
}
