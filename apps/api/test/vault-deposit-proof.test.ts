import { describe, expect, it } from "vitest";
import {
  validateVaultDepositProof, type VaultDepositProof, type ExpectedVaultDeposit,
} from "../src/domain/vault-deposit-proof.js";

const vault = "0x1111111111111111111111111111111111111111";
const owner = "0x2222222222222222222222222222222222222222";
const hash = `0x${"ab".repeat(32)}`;
const proof: VaultDepositProof = {
  chainId: 143n, vaultAddress: vault, ownerAddress: owner,
  transactionHash: hash, logIndex: 3, shares: 200n, assets: 198n, finalized: true,
};
const expected: ExpectedVaultDeposit = {
  chainId: 143n, vaultAddress: vault, ownerAddress: owner,
  transactionHash: hash, logIndex: 3, shares: 200n,
};
describe("finalized vault deposit proof", () => {
  it("accepts an exact verified share-mint event", () => {
    expect(validateVaultDepositProof(proof, expected)).toBe(`143:${vault}:${hash}:3`);
  });
  it("normalizes hexadecimal casing consistently", () => {
    expect(validateVaultDepositProof({...proof, transactionHash:hash.toUpperCase().replace("0X","0x")}, expected))
      .toBe(`143:${vault}:${hash}:3`);
  });
  it("rejects unfinalized evidence", () => {
    expect(() => validateVaultDepositProof({...proof,finalized:false},expected)).toThrow(/finalized/);
  });
  it("rejects a different chain, vault or account", () => {
    expect(() => validateVaultDepositProof({...proof,chainId:1n},expected)).toThrow(/chain/);
    expect(() => validateVaultDepositProof({...proof,vaultAddress:owner},expected)).toThrow(/vault/);
    expect(() => validateVaultDepositProof({...proof,ownerAddress:vault},expected)).toThrow(/owner/);
  });
  it("requires the exact tx and log identity", () => {
    expect(() => validateVaultDepositProof({...proof,transactionHash:`0x${"cd".repeat(32)}`},expected))
      .toThrow(/transaction/);
    expect(() => validateVaultDepositProof({...proof,logIndex:4},expected)).toThrow(/log index/);
  });
  it("requires the exact minted share amount, not just deposited assets", () => {
    expect(() => validateVaultDepositProof({...proof,shares:199n},expected)).toThrow(/shares/);
    expect(() => validateVaultDepositProof({...proof,shares:0n},expected)).toThrow(/shares/);
    expect(() => validateVaultDepositProof({...proof,assets:-1n},expected)).toThrow(/shares/);
  });
  it("rejects invalid identifiers", () => {
    expect(() => validateVaultDepositProof({...proof,vaultAddress:"0x123"},expected)).toThrow(/address/);
    expect(() => validateVaultDepositProof({...proof,transactionHash:"0xabc"},expected)).toThrow(/hash/);
    expect(() => validateVaultDepositProof({...proof,logIndex:-1},expected)).toThrow(/log index/);
  });
});
