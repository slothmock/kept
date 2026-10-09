import {describe,expect,it} from "vitest";
import {resolveVaultActivityIndexStartAt} from "../src/vault-activity-index-config.js";

describe("Monad vault activity indexing configuration",()=>{
  it("enables historical vault indexing on mainnet with an explicit start",()=>{
    expect(resolveVaultActivityIndexStartAt(143,{
      VAULT_ACTIVITY_INDEX_MAINNET_START_AT:"2025-11-24T00:00:00.000Z",
      VAULT_ACTIVITY_INDEX_START_AT:"2026-10-02T00:00:00.000Z",
    })?.toISOString()).toBe("2025-11-24T00:00:00.000Z");
  });
  it("fails closed on mainnet without a configured backfill date",()=>{
    expect(()=>resolveVaultActivityIndexStartAt(143,{}))
      .toThrow(/MAINNET_START_AT is required/);
    expect(()=>resolveVaultActivityIndexStartAt(143,{
      VAULT_ACTIVITY_INDEX_START_AT:"2026-10-02T00:00:00.000Z",
    })).toThrow(/MAINNET_START_AT is required/);
  });
  it("preserves the testnet default and supports a separate testnet override",()=>{
    expect(resolveVaultActivityIndexStartAt(10143,{})?.toISOString())
      .toBe("2026-10-02T00:00:00.000Z");
    expect(resolveVaultActivityIndexStartAt(10143,{
      VAULT_ACTIVITY_INDEX_START_AT:"2026-09-01T00:00:00.000Z",
    })?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
  it("does not enable production indexing on local Anvil",()=>{
    expect(resolveVaultActivityIndexStartAt(31337,{})).toBeUndefined();
  });
  it("rejects ambiguous, invalid or subsecond timestamps",()=>{
    for(const input of ["2026-10-02","2026-10-02T00:00:00+01:00",
      "2026-02-30T00:00:00.000Z","2026-10-02T00:00:00.123Z"]){
      expect(()=>resolveVaultActivityIndexStartAt(143,{
        VAULT_ACTIVITY_INDEX_MAINNET_START_AT:input,
      })).toThrow();
    }
  });
});
