import { getAddress, type Address } from "viem";

const MONAD_CHAIN_ID = 143;
const MONAD_TESTNET_CHAIN_ID = 10_143;
const LOCAL_ANVIL_CHAIN_ID = 31_337;

// Aave V3 Monad Protocol Data Provider.
const MONAD_AAVE_PROTOCOL_DATA_PROVIDER = getAddress(
  "0xB65A68B98274ef7D9a60E0C0747dD1BEc3D32fad",
);

const BPS_DENOMINATOR = 10_000n;
const RAY = 10n ** 27n;
const DAYS_PER_YEAR = 365;

const vaultAbi = [
  {
    type: "function",
    name: "strategy",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
  },
  {
    type: "function",
    name: "PROFIT_FEE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
] as const;

const strategyAbi = [
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
  },
  {
    type: "function",
    name: "annualYieldBps",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "aToken",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
  },
  {
    type: "function",
    name: "availableLiquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
] as const;

const erc20ViewAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      {
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
  },
] as const;

const aaveProtocolDataProviderAbi = [
  {
    type: "function",
    name: "getReserveCaps",
    stateMutability: "view",
    inputs: [
      {
        name: "asset",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "borrowCap",
        type: "uint256",
      },
      {
        name: "supplyCap",
        type: "uint256",
      },
    ],
  },
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [
      {
        name: "asset",
        type: "address",
      },
    ],
    outputs: [
      { name: "unbacked", type: "uint256" },
      { name: "accruedToTreasuryScaled", type: "uint256" },
      { name: "totalAToken", type: "uint256" },
      { name: "totalStableDebt", type: "uint256" },
      { name: "totalVariableDebt", type: "uint256" },
      { name: "liquidityRate", type: "uint256" },
      { name: "variableBorrowRate", type: "uint256" },
      { name: "stableBorrowRate", type: "uint256" },
      { name: "averageStableBorrowRate", type: "uint256" },
      { name: "liquidityIndex", type: "uint256" },
      { name: "variableBorrowIndex", type: "uint256" },
      { name: "lastUpdateTimestamp", type: "uint40" },
    ],
  },
] as const;

interface MarketStatusPublicClient {
  getChainId(): Promise<number>;
  readContract(input: unknown): Promise<unknown>;
}

export interface SavingsMarketStatusDto {
  readonly suppliedAssetsAtomic: string | null;
  readonly supplyCapAssetsAtomic: string | null;
  readonly availableToDepositAtomic: string | null;
  readonly availableToWithdrawAtomic: string;
  readonly grossApyBps: string;
  readonly netApyBps: string;
}

export interface SavingsMarketStatusReader {
  readStatus(): Promise<SavingsMarketStatusDto>;
}

export interface LocalAaveMarketConfig {
  readonly supplyCapAssets: bigint;
  readonly grossApyBps: number;
}

function requireBigInt(value: unknown, field: string): bigint {
  if (typeof value !== "bigint") {
    throw new Error(`${field} returned an invalid value`);
  }

  return value;
}

function requireAddressValue(value: unknown, field: string): Address {
  if (typeof value !== "string") {
    throw new Error(`${field} returned an invalid address`);
  }

  return getAddress(value);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    const converted = Number(value);

    if (Number.isSafeInteger(converted)) {
      return converted;
    }
  }

  throw new Error(`${field} returned an invalid value`);
}

function rayAprToApyBps(liquidityRate: bigint): number {
  const apr = Number(liquidityRate) / Number(RAY);

  if (!Number.isFinite(apr) || apr < 0) {
    throw new Error("Aave liquidity rate is invalid");
  }

  const apy = Math.pow(1 + apr / DAYS_PER_YEAR, DAYS_PER_YEAR) - 1;

  return Math.max(0, Math.round(apy * 10_000));
}

function netApyBps(grossApyBps: number, performanceFeeBps: bigint): number {
  if (!Number.isSafeInteger(grossApyBps) || grossApyBps < 0) {
    throw new Error("Gross APY basis points are invalid");
  }

  if (performanceFeeBps < 0n || performanceFeeBps > BPS_DENOMINATOR) {
    throw new Error("Kept performance fee is invalid");
  }

  return Number(
    (BigInt(grossApyBps) * (BPS_DENOMINATOR - performanceFeeBps)) /
      BPS_DENOMINATOR,
  );
}

export function createSavingsMarketStatusReader(input: {
  readonly publicClient: MarketStatusPublicClient;

  readonly vault: Address;

  readonly chainId:
    | typeof MONAD_CHAIN_ID
    | typeof MONAD_TESTNET_CHAIN_ID
    | typeof LOCAL_ANVIL_CHAIN_ID;

  readonly localAave?: LocalAaveMarketConfig;
}): SavingsMarketStatusReader {
  async function assertChain(): Promise<void> {
    const actualChainId = await input.publicClient.getChainId();

    if (actualChainId !== input.chainId) {
      throw new Error(
        `RPC chain ID does not match configured chain ${input.chainId}`,
      );
    }
  }

  return {
    async readStatus(): Promise<SavingsMarketStatusDto> {
      await assertChain();

      const [strategyValue, performanceFeeValue] = await Promise.all([
        input.publicClient.readContract({
          address: input.vault,
          abi: vaultAbi,
          functionName: "strategy",
        }),
        input.publicClient.readContract({
          address: input.vault,
          abi: vaultAbi,
          functionName: "PROFIT_FEE_BPS",
        }),
      ]);

      const strategy = requireAddressValue(strategyValue, "Vault strategy");

      const performanceFeeBps = requireBigInt(
        performanceFeeValue,
        "Performance fee",
      );

      if (input.chainId === MONAD_TESTNET_CHAIN_ID) {
        const [assetValue, strategyLiquidityValue, annualYieldBpsValue] =
          await Promise.all([
            input.publicClient.readContract({
              address: strategy,
              abi: strategyAbi,
              functionName: "asset",
            }),
            input.publicClient.readContract({
              address: strategy,
              abi: strategyAbi,
              functionName: "availableLiquidity",
            }),
            input.publicClient.readContract({
              address: strategy,
              abi: strategyAbi,
              functionName: "annualYieldBps",
            }),
          ]);

        const asset = requireAddressValue(assetValue, "Strategy asset");
        const strategyLiquidity = requireBigInt(
          strategyLiquidityValue,
          "Strategy liquidity",
        );
        const grossApyBps = requireNumber(
          annualYieldBpsValue,
          "Staging annual yield",
        );

        const vaultIdleValue = await input.publicClient.readContract({
          address: asset,
          abi: erc20ViewAbi,
          functionName: "balanceOf",
          args: [input.vault],
        });

        const vaultIdle = requireBigInt(vaultIdleValue, "Vault idle balance");

        return {
          suppliedAssetsAtomic: strategyLiquidity.toString(),
          supplyCapAssetsAtomic: null,
          availableToDepositAtomic: null,
          availableToWithdrawAtomic: (vaultIdle + strategyLiquidity).toString(),
          grossApyBps: grossApyBps.toString(),
          netApyBps: netApyBps(grossApyBps, performanceFeeBps).toString(),
        };
      }

      const [assetValue, aTokenValue, strategyLiquidityValue] =
        await Promise.all([
          input.publicClient.readContract({
            address: strategy,
            abi: strategyAbi,
            functionName: "asset",
          }),
          input.publicClient.readContract({
            address: strategy,
            abi: strategyAbi,
            functionName: "aToken",
          }),
          input.publicClient.readContract({
            address: strategy,
            abi: strategyAbi,
            functionName: "availableLiquidity",
          }),
        ]);

      const asset = requireAddressValue(assetValue, "Strategy asset");

      const aToken = requireAddressValue(aTokenValue, "Strategy aToken");

      const strategyLiquidity = requireBigInt(
        strategyLiquidityValue,
        "Strategy liquidity",
      );

      const [vaultIdleValue, decimalsValue] = await Promise.all([
        input.publicClient.readContract({
          address: asset,
          abi: erc20ViewAbi,
          functionName: "balanceOf",
          args: [input.vault],
        }),
        input.publicClient.readContract({
          address: asset,
          abi: erc20ViewAbi,
          functionName: "decimals",
        }),
      ]);

      const vaultIdle = requireBigInt(vaultIdleValue, "Vault idle balance");

      const decimals = requireNumber(decimalsValue, "Asset decimals");

      if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) {
        throw new Error("Asset decimals are invalid");
      }

      let suppliedAssets: bigint | null;

      let supplyCapAssets: bigint | null;

      let availableToDeposit: bigint | null;

      let grossApyBps: number;

      if (input.chainId === LOCAL_ANVIL_CHAIN_ID) {
        const localAave = input.localAave;

        if (!localAave) {
          throw new Error("Local Aave market configuration is missing");
        }

        const totalATokenValue = await input.publicClient.readContract({
          address: aToken,
          abi: erc20ViewAbi,
          functionName: "totalSupply",
        });

        const totalAToken = requireBigInt(
          totalATokenValue,
          "Local aToken total supply",
        );

        suppliedAssets = totalAToken;

        supplyCapAssets = localAave.supplyCapAssets;

        availableToDeposit =
          supplyCapAssets > suppliedAssets
            ? supplyCapAssets - suppliedAssets
            : 0n;

        grossApyBps = localAave.grossApyBps;
      } else {
        const [capsValue, reserveDataValue] = await Promise.all([
          input.publicClient.readContract({
            address: MONAD_AAVE_PROTOCOL_DATA_PROVIDER,
            abi: aaveProtocolDataProviderAbi,
            functionName: "getReserveCaps",
            args: [asset],
          }),
          input.publicClient.readContract({
            address: MONAD_AAVE_PROTOCOL_DATA_PROVIDER,
            abi: aaveProtocolDataProviderAbi,
            functionName: "getReserveData",
            args: [asset],
          }),
        ]);

        if (!Array.isArray(capsValue)) {
          throw new Error("Aave reserve caps returned an invalid value");
        }

        if (!Array.isArray(reserveDataValue)) {
          throw new Error("Aave reserve data returned an invalid value");
        }

        const supplyCap = requireBigInt(capsValue[1], "Aave supply cap");

        const totalAToken = requireBigInt(
          reserveDataValue[2],
          "Aave total supplied assets",
        );

        suppliedAssets = totalAToken;

        const liquidityRate = requireBigInt(
          reserveDataValue[5],
          "Aave liquidity rate",
        );

        if (supplyCap === 0n) {
          supplyCapAssets = null;
          availableToDeposit = null;
        } else {
          const scale = 10n ** BigInt(decimals);

          supplyCapAssets = supplyCap * scale;

          availableToDeposit =
            supplyCapAssets > suppliedAssets
              ? supplyCapAssets - suppliedAssets
              : 0n;
        }

        grossApyBps = rayAprToApyBps(liquidityRate);
      }

      return {
        suppliedAssetsAtomic:
          suppliedAssets === null ? null : suppliedAssets.toString(),

        supplyCapAssetsAtomic:
          supplyCapAssets === null ? null : supplyCapAssets.toString(),

        availableToDepositAtomic:
          availableToDeposit === null ? null : availableToDeposit.toString(),

        availableToWithdrawAtomic: (vaultIdle + strategyLiquidity).toString(),

        grossApyBps: grossApyBps.toString(),

        netApyBps: netApyBps(grossApyBps, performanceFeeBps).toString(),
      };
    },
  };
}
