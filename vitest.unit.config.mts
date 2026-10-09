import { defineConfig, mergeConfig } from "vitest/config";
import base, { infrastructureTestFiles } from "./vitest.config.mts";

export default mergeConfig(base, defineConfig({
  test: {
    fileParallelism: true,
    maxWorkers: 4,
    exclude: infrastructureTestFiles,
  },
}));
