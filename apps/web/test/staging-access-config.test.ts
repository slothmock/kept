import { describe, expect, it } from "vitest";
import { requiresStagingAccess } from "../src/app/staging-access-config.js";

describe("staging access boundary configuration", () => {
  it("requires allowlist checks on Monad testnet", () => {
    expect(requiresStagingAccess("10143")).toBe(true);
  });
  it("does not gate Monad mainnet accounts", () => {
    expect(requiresStagingAccess("143")).toBe(false);
  });
  it("does not call staging verification for local Anvil or unspecified chains", () => {
    expect(requiresStagingAccess("31337")).toBe(false);
    expect(requiresStagingAccess(undefined)).toBe(false);
  });
});
