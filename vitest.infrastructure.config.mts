import { defineConfig, mergeConfig } from "vitest/config";
import base, { infrastructureTestFiles } from "./vitest.config.mts";

export default mergeConfig(base, defineConfig({
  test: {
    include: infrastructureTestFiles,
    fileParallelism: false,
    maxWorkers: 1,
  },
}));
