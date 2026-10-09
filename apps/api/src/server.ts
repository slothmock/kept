import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
} from "viem";

import { privateKeyToAccount } from "viem/accounts";

import { createPrivyAuthenticator } from "./auth.js";
import { buildApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { connectDatabase } from "./db/client.js";
import { createCommitmentSettlementVerifier } from "./commitment-settlement.js";

import { KeptPersistenceService } from "./persistence/index.js";

import { KeptRepository } from "./persistence/repository.js";
import { AllocationLedgerStore } from "./persistence/allocation-ledger-store.js";

import { createVaultShareBalanceReader } from "./vault-shares.js";

import { createVaultSavingsActivityReader } from "./vault-activity.js";

import { createVaultActivityIndex } from "./vault-activity-index.js";

import { createSavingsPerformanceReader } from "./savings-performance.js";

import { createSavingsMarketStatusReader } from "./savings-market-status.js";

import {
  CommitmentVerificationWorker,
  CommitmentVerifier,
  AllocationWeeklySavingsEvidenceSource,
  RoutedWeeklySavingsEvidenceSource,
  FixedRewardPolicy,
  PersistenceVerificationStore,
  PersistenceWeeklySavingsEvidenceSource,
  ViemCommitmentSettlementGateway,
} from "./verifier/index.js";

const VERIFICATION_INTERVAL_MS = 60_000;

const VAULT_ACTIVITY_SYNC_INTERVAL_MS = 30_000;

const VERIFICATION_BATCH_SIZE = 50;

// Temporary hackathon reward.
//
// USDC uses 6 decimals, so this is 5 USDC.
// Keep this simple until the final commitment
// reward economics are decided.
const WEEKLY_SAVINGS_REWARD_ASSETS = 5_000_000n;

const STAGING_FAUCET_AMOUNT_ASSETS = 1_000_000_000n;

const stagingVaultAssetAbi = [
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const stagingUsdcAbi = [
  {
    type: "function",
    name: "minters",
    stateMutability: "view",
    inputs: [{ name: "minter", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const config = loadApiConfig();

const commitmentWindowOverrideSeconds =
  config.monadChainId === 31_337 &&
    process.env.ENABLE_LOCAL_ANVIL === "true" &&
    process.env.DEV_COMMITMENT_WINDOW_SECONDS
    ? Number(process.env.DEV_COMMITMENT_WINDOW_SECONDS)
    : undefined;

if (
  commitmentWindowOverrideSeconds !== undefined &&
  (!Number.isSafeInteger(commitmentWindowOverrideSeconds) ||
    commitmentWindowOverrideSeconds < 10)
) {
  throw new Error("DEV_COMMITMENT_WINDOW_SECONDS must be an integer >= 10");
}

const database = connectDatabase(config.databaseUrl);

const repository = new KeptRepository(database.db);

const publicClient = createPublicClient({
  transport: http(config.monadRpcUrl),
});

const verifierAccount = privateKeyToAccount(
  config.commitmentVerifierPrivateKey,
);

const verifierWalletClient = createWalletClient({
  account: verifierAccount,

  transport: http(config.monadRpcUrl),
});

const commitmentSettlementGateway = new ViemCommitmentSettlementGateway({
  publicClient,

  walletClient: verifierWalletClient,

  manager: config.commitmentManagerAddress,
});

const vaultShares = createVaultShareBalanceReader({
  publicClient: {
    getChainId: () => publicClient.getChainId(),

    readContract: async (request) =>
      publicClient.readContract(request as never) as Promise<bigint>,
  },

  vault: config.keptSavingsVaultAddress,

  chainId: config.monadChainId,
});

const vaultActivity = createVaultSavingsActivityReader({
  publicClient: {
    getChainId: () => publicClient.getChainId(),

    getBlockNumber: () => publicClient.getBlockNumber(),

    getBlock: async (request) => {
      const block = await publicClient.getBlock(request);

      return {
        number: block.number,

        timestamp: block.timestamp,
      };
    },

    getLogs: async (request) => publicClient.getLogs(request as never) as never,
  },

  vault: config.keptSavingsVaultAddress,

  chainId: config.monadChainId,
});

const savingsPerformance = createSavingsPerformanceReader({
  vaultActivity,
  vaultShares,
});

const savingsCurrentAssets = {
  async read(
    account: string,
    blockNumber?: bigint,
  ): Promise<bigint> {
    const shares =
      await vaultShares.readShares(
        account,
        blockNumber,
      );

    return vaultShares
      .convertToAssets(
        shares,
        blockNumber,
      );
  },
};

const savingsActivityIndex =
  config.monadChainId === 10_143
    ? createVaultActivityIndex({
      db: database.db,

      publicClient: {
        getChainId: () =>
          publicClient.getChainId(),

        getBlockNumber: () =>
          publicClient.getBlockNumber(),

        getBlock: async (request) => {
          const block =
            await publicClient.getBlock(
              request,
            );

          return {
            number:
              block.number,
            timestamp:
              block.timestamp,
          };
        },

        getLogs: async (request) =>
          publicClient.getLogs(
            request as never,
          ) as never,
      },

      vault:
        config.keptSavingsVaultAddress,

      chainId:
        config.monadChainId,

      startAt:
        new Date(
          process.env
            .VAULT_ACTIVITY_INDEX_START_AT
          ?? "2026-10-02T00:00:00.000Z",
        ),
    })
    : undefined;

const localSupplyCapUsdc = process.env.LOCAL_AAVE_SUPPLY_CAP_USDC
  ? BigInt(process.env.LOCAL_AAVE_SUPPLY_CAP_USDC)
  : 1_000_000n;

const localGrossApyBps = process.env.LOCAL_AAVE_GROSS_APY_BPS
  ? Number(process.env.LOCAL_AAVE_GROSS_APY_BPS)
  : 500;

if (
  localSupplyCapUsdc <= 0n ||
  !Number.isSafeInteger(localGrossApyBps) ||
  localGrossApyBps < 0
) {
  throw new Error("Local Aave market configuration is invalid");
}

const savingsMarketStatus =
  createSavingsMarketStatusReader({
    publicClient: {
      getChainId: () =>
        publicClient.getChainId(),

      readContract: async (request) =>
        publicClient.readContract(
          request as never,
        ),
    },

    vault:
      config.keptSavingsVaultAddress,

    chainId:
      config.monadChainId,

    ...(config.monadChainId === 31_337
      ? {
        localAave: {
          supplyCapAssets:
            localSupplyCapUsdc
            * 1_000_000n,

          grossApyBps:
            localGrossApyBps,
        },
      }
      : {}),
  });

const legacyWeeklySavingsEvidence = new PersistenceWeeklySavingsEvidenceSource({
  repository,
  vaultShares,
  vaultActivity,
  chainId: BigInt(config.monadChainId),
});

const allocationLedger = new AllocationLedgerStore(database.db);
const ledgerWeeklySavingsEvidence = new AllocationWeeklySavingsEvidenceSource({
  db: database.db,
  repository,
  vaultShares,
  vaultActivity,
  chainId: BigInt(config.monadChainId),
});

const weeklySavingsEvidence = new RoutedWeeklySavingsEvidenceSource({
  legacy: legacyWeeklySavingsEvidence,
  ledger: ledgerWeeklySavingsEvidence,
  isLedgerInitialized: userId => database.db.transaction(
    tx => allocationLedger.hasOpeningInTransaction(tx, userId),
  ),
  async assertLedgerEvidenceReady(userId) {
    // Do not settle rewards from partial or stale deposit provenance.
    // The activity index is currently provisioned for Monad testnet.
    const index = savingsActivityIndex?.status();
    if (!index?.ready || index.currentBlock === null) {
      throw new Error("Savings deposit attribution index is unavailable");
    }
    const head = await publicClient.getBlockNumber();
    const safeHead = head > 2n ? head - 2n : 0n;
    if (index.currentBlock < safeHead) {
      throw new Error("Savings deposit attribution index is catching up");
    }
    const wallet = await repository.findPrimaryWalletForOwnerOnChain(
      userId, BigInt(config.monadChainId),
    );
    if (!wallet) throw new Error("No verified embedded savings wallet");
    const liveShares = await vaultShares.readShares(wallet.address);
    await database.db.transaction(tx =>
      allocationLedger.assertVaultParityInTransaction(tx, userId, liveShares),
    );
  },
});

const verificationStore = new PersistenceVerificationStore(database.db);

const rewards = new FixedRewardPolicy(WEEKLY_SAVINGS_REWARD_ASSETS);

const commitmentVerifier = new CommitmentVerifier({
  store: verificationStore,

  weeklySavings: weeklySavingsEvidence,

  // ACTIVITY_COUNT_V1 is deliberately not
  // enabled in the automatic worker yet.
  //
  // The due-commitment repository query
  // should currently select only
  // WEEKLY_SAVINGS_V1 commitments.
  activity: {
    async countActivities() {
      throw new Error("Activity verification is not enabled");
    },
  },

  settlement: commitmentSettlementGateway,

  rewards,

  onDiagnostic: (event, error) => {
    console.error("[verifier diagnostic]", event, error);
  },
});

const verificationWorker = new CommitmentVerificationWorker({
  repository,

  verifier: commitmentVerifier,

  batchSize: VERIFICATION_BATCH_SIZE,
});

const persistence = new KeptPersistenceService(
  database.db,
  {
    chainId: BigInt(config.monadChainId),

    vaultAddress: config.keptSavingsVaultAddress,

    reader: vaultShares,
  },
  config.commitmentWindowOverrideSeconds,
  savingsActivityIndex ? () => savingsActivityIndex.status() : undefined,
);

const settlementVerifier = createCommitmentSettlementVerifier({
  publicClient: {
    getChainId: () => publicClient.getChainId(),

    getTransaction: async (request) => {
      const transaction = await publicClient.getTransaction(request);

      return {
        from: transaction.from,

        to: transaction.to,

        input: transaction.input,
      };
    },

    getTransactionReceipt: async (request) => {
      const receipt = await publicClient.getTransactionReceipt(request);

      return {
        status: receipt.status,

        blockNumber: receipt.blockNumber,

        logs: receipt.logs.map((log) => ({
          address: log.address,

          data: log.data,

          topics: log.topics,
        })),
      };
    },

    getBlockNumber: () => publicClient.getBlockNumber(),

    readContract: (request) => publicClient.readContract(request),
  },

  chainId: config.monadChainId,

  manager: config.commitmentManagerAddress,
});

const stagingFaucetClaims =
  new Set<string>();

const stagingFaucet =
  config.monadChainId === 10_143
    ? {
      async claim(wallet: string) {
        const recipient =
          getAddress(wallet);

        const claimKey =
          recipient.toLowerCase();

        if (
          stagingFaucetClaims.has(
            claimKey,
          )
        ) {
          throw new Error(
            "Staging faucet already claimed for this wallet",
          );
        }

        const asset =
          await publicClient.readContract({
            address:
              config.keptSavingsVaultAddress,
            abi: stagingVaultAssetAbi,
            functionName: "asset",
          });

        const verifierIsMinter =
          await publicClient.readContract({
            address: asset,
            abi: stagingUsdcAbi,
            functionName: "minters",
            args: [
              verifierAccount.address,
            ],
          });

        if (!verifierIsMinter) {
          throw new Error(
            "Staging faucet signer is not authorized as a token minter",
          );
        }

        stagingFaucetClaims.add(
          claimKey,
        );

        try {
          const hash =
            await verifierWalletClient
              .writeContract({
                address: asset,
                abi: stagingUsdcAbi,
                functionName: "mint",
                args: [
                  recipient,
                  STAGING_FAUCET_AMOUNT_ASSETS,
                ],
                chain: null,
              });

          const receipt =
            await publicClient
              .waitForTransactionReceipt({
                hash,
                confirmations: 1,
              });

          if (
            receipt.status
            !== "success"
          ) {
            throw new Error(
              "Staging faucet transaction reverted",
            );
          }

          return {
            amountAtomic:
              STAGING_FAUCET_AMOUNT_ASSETS
                .toString(),

            transactionHash: hash,
          };
        } catch (error) {
          stagingFaucetClaims.delete(
            claimKey,
          );

          throw error;
        }
      },
    }
    : undefined;

const app = buildApp(
  {
    authenticate: createPrivyAuthenticator({
      appId: config.privyAppId,
      verificationKey: config.privyJwtVerificationKey,
      appSecret: config.privyAppSecret,
    }),

    chainId: config.monadChainId,

    persistence,

    savingsPerformance,

    savingsCurrentAssets,

    ...(savingsActivityIndex
      ? { savingsActivityIndex }
      : {}),

    savingsMarketStatus,

    ...(stagingFaucet
      ? { stagingFaucet }
      : {}),

    commitmentSettlementVerifier:
      settlementVerifier,

    ...(config.moonPay
      ? {
        moonPay: config.moonPay,
      }
      : {}),
  },
  {
    solanaRpc: {
      url: config.solanaRpcUrl,
    },
    enableLogging: true,

    webOrigin:
      config.webOrigin,

    stagingAllowedPrivyUserIds:
      config.stagingAllowedPrivyUserIds,

    auroraIntents: {
      baseUrl:
        config.auroraIntentsBaseUrl,

      apiKey:
        config.auroraIntentsApiKey,
    },
  },
);

let verificationInterval: ReturnType<typeof setInterval> | null = null;

let vaultActivityInterval: ReturnType<typeof setInterval> | null = null;

let verificationRunning = false;

let vaultActivitySyncRunning = false;

let closing = false;

async function runVaultActivitySync(): Promise<void> {
  if (
    !savingsActivityIndex
    || vaultActivitySyncRunning
    || closing
  ) {
    return;
  }

  vaultActivitySyncRunning = true;

  try {
    const result =
      await savingsActivityIndex
        .syncToHead();

    if (result) {
      app.log.info(
        {
          fromBlock:
            result.fromBlock.toString(),
          toBlock:
            result.toBlock.toString(),
          eventsIndexed:
            result.eventsIndexed,
        },
        "Vault activity index synchronized",
      );
    }
  } catch (error) {
    app.log.error(
      error,
      "Vault activity index synchronization failed",
    );
  } finally {
    vaultActivitySyncRunning = false;
  }
}

async function runVerification(): Promise<void> {
  if (verificationRunning || closing) {
    return;
  }

  verificationRunning = true;

  try {
    const result = await verificationWorker.runOnce();

    if (result.checked > 0 || result.failed > 0) {
      app.log.info(result, "Commitment verification pass completed");
    }
  } catch (error) {
    app.log.error(error, "Commitment verification worker failed");
  } finally {
    verificationRunning = false;
  }
}

const close = async (): Promise<void> => {
  if (closing) {
    return;
  }

  closing = true;

  if (verificationInterval !== null) {
    clearInterval(verificationInterval);

    verificationInterval = null;
  }

  if (vaultActivityInterval !== null) {
    clearInterval(vaultActivityInterval);

    vaultActivityInterval = null;
  }

  try {
    await app.close();
  } finally {
    await database.close();
  }
};

process.once("SIGINT", () => {
  void close();
});

process.once("SIGTERM", () => {
  void close();
});

try {
  await app.listen({
    host: "0.0.0.0",

    port: config.port,
  });

  app.log.info(
    {
      verifier: verifierAccount.address,

      intervalMs: VERIFICATION_INTERVAL_MS,

      batchSize: VERIFICATION_BATCH_SIZE,
    },
    "Commitment verification worker enabled",
  );

  // Run once immediately after the API
  // has successfully started.
  await runVerification();

  void runVaultActivitySync();

  verificationInterval = setInterval(() => {
    void runVerification();
  }, VERIFICATION_INTERVAL_MS);

  vaultActivityInterval = setInterval(() => {
    void runVaultActivitySync();
  }, VAULT_ACTIVITY_SYNC_INTERVAL_MS);
} catch (error) {
  app.log.error(error, "API startup failed");

  await close();

  process.exitCode = 1;
}
