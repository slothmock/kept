import type { Address } from "viem";

const vaultFeeAbi = [
  {
    type: "function",
    name: "BPS_DENOMINATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "DEPOSIT_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "PROFIT_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "previewDeposit",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
] as const;

interface ContractReader {
  readContract(input: unknown): Promise<unknown>;
}

export interface VaultDepositQuote {
  readonly assets: bigint;
  readonly depositFeeAssets: bigint;
  readonly depositFeeBps: bigint;
  readonly expectedNetAssets: bigint;
  readonly performanceFeeBps: bigint;
  readonly bpsDenominator: bigint;
}

interface ReadVaultDepositQuoteInput {
  readonly publicClient: ContractReader;
  readonly vault: Address;
  readonly assets: bigint;
}

export async function readVaultDepositQuote({
  publicClient,
  vault,
  assets,
}: ReadVaultDepositQuoteInput): Promise<VaultDepositQuote> {
  const [rawBpsDenominator, rawDepositFeeBps, rawPerformanceFeeBps, rawExpectedShares] = await Promise.all([
    publicClient.readContract({
      address: vault,
      abi: vaultFeeAbi,
      functionName: "BPS_DENOMINATOR",
    }),
    publicClient.readContract({
      address: vault,
      abi: vaultFeeAbi,
      functionName: "DEPOSIT_FEE_BPS",
    }),
    publicClient.readContract({
      address: vault,
      abi: vaultFeeAbi,
      functionName: "PROFIT_FEE_BPS",
    }),
    publicClient.readContract({
      address: vault,
      abi: vaultFeeAbi,
      functionName: "previewDeposit",
      args: [assets],
    }),
  ]);
  const bpsDenominator = asBigInt(rawBpsDenominator);
  const depositFeeBps = asBigInt(rawDepositFeeBps);
  const performanceFeeBps = asBigInt(rawPerformanceFeeBps);
  const expectedShares = asBigInt(rawExpectedShares);

  if (
    bpsDenominator <= 0n
    || depositFeeBps < 0n
    || performanceFeeBps < 0n
    || depositFeeBps > bpsDenominator
    || performanceFeeBps > bpsDenominator
  ) {
    throw new Error("Invalid vault fee configuration");
  }
  if (assets <= 0n || expectedShares <= 0n) {
    throw new Error("Invalid vault deposit preview");
  }

  const expectedNetAssets = asBigInt(await publicClient.readContract({
    address: vault,
    abi: vaultFeeAbi,
    functionName: "convertToAssets",
    args: [expectedShares],
  }));
  if (expectedNetAssets <= 0n || expectedNetAssets > assets) {
    throw new Error("Invalid vault deposit preview");
  }

  return {
    assets,
    depositFeeAssets: assets - expectedNetAssets,
    depositFeeBps,
    expectedNetAssets,
    performanceFeeBps,
    bpsDenominator,
  };
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  throw new Error("Invalid vault fee response");
}

export function formatBasisPoints(basisPoints: bigint, denominator: bigint): string {
  if (denominator <= 0n) return "—";
  const hundredthsOfPercent = basisPoints * 10_000n / denominator;
  const whole = hundredthsOfPercent / 100n;
  const fractional = hundredthsOfPercent % 100n;
  return `${whole.toString()}.${fractional.toString().padStart(2, "0")}%`;
}
