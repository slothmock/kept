import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./apps/api/drizzle",
  schema: "./apps/api/src/db/schema.ts",
  strict: true,
  verbose: true,
});
