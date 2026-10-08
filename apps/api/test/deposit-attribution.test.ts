import {describe,expect,it} from "vitest";
import {planFreshDepositAttribution} from "../src/domain/deposit-attribution.js";

describe("fresh vault deposit attribution",()=>{
  it("credits only an exact verified minted-share gap",()=>{
    expect(planFreshDepositAttribution({
      mintedShares:20n,currentVaultShares:120n,ledgerShares:100n,
    })).toEqual({kind:"CREDIT",shares:20n});
  });
  it("does not create or reclassify shares already reflected in the ledger",()=>{
    expect(planFreshDepositAttribution({
      mintedShares:20n,currentVaultShares:120n,ledgerShares:120n,
    })).toEqual({kind:"ALREADY_REFLECTED"});
  });
  it("rejects a partially reconciled deposit instead of double counting",()=>{
    expect(()=>planFreshDepositAttribution({
      mintedShares:20n,currentVaultShares:120n,ledgerShares:110n,
    })).toThrow(/uniquely attributed/);
  });
  it("rejects unexplained additional funding or withdrawals",()=>{
    expect(()=>planFreshDepositAttribution({
      mintedShares:20n,currentVaultShares:150n,ledgerShares:100n,
    })).toThrow(/uniquely attributed/);
    expect(()=>planFreshDepositAttribution({
      mintedShares:20n,currentVaultShares:90n,ledgerShares:100n,
    })).toThrow(/exceeds/);
  });
  it("rejects zero and negative input",()=>{
    expect(()=>planFreshDepositAttribution({
      mintedShares:0n,currentVaultShares:0n,ledgerShares:0n,
    })).toThrow(/Invalid/);
    expect(()=>planFreshDepositAttribution({
      mintedShares:1n,currentVaultShares:-1n,ledgerShares:0n,
    })).toThrow(/Invalid/);
  });
});
