import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Database suites share the same PostgreSQL schemas and reset tables;
// Anvil suites may depend on external node state. Keep them out of workers.
export const infrastructureTestFiles = [
  "apps/api/test/allocation-deposit-claims.test.ts",
  "apps/api/test/allocation-ledger-persistence.test.ts",
  "apps/api/test/allocation-provenance-persistence.test.ts",
  "apps/api/test/commitment-overlap-concurrency.test.ts",
  "apps/api/test/embedded-wallet-ledger-initialization.test.ts",
  "apps/api/test/goal-allocation-reconciliation.test.ts",
  "apps/api/test/persistence.integration.test.ts",
  "apps/api/test/vault-activity-shares.test.ts",
  "apps/api/test/settlement-gateway.anvil.test.ts",
  "apps/api/test/verification-worker.anvil.test.ts",
];

const shared = {
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)),
    },
  },
};

const commonExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "packages/contracts/lib/**",
];

export default defineConfig({
  ...shared,
  test: {
    exclude: commonExclude,
    // Preserve the original serial behaviour when running Vitest directly.
    fileParallelism: false,
  },
});
