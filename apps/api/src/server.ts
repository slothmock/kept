import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem";

import {
  privateKeyToAccount,
} from "viem/accounts";

import { createPrivyAuthenticator } from "./auth.js";
import { buildApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { connectDatabase } from "./db/client.js";
import { createCommitmentSettlementVerifier } from "./commitment-settlement.js";

import {
  KeptPersistenceService,
} from "./persistence/index.js";

import {
  KeptRepository,
} from "./persistence/repository.js";

import {
  createVaultShareBalanceReader,
} from "./vault-shares.js";

import {
  createVaultSavingsActivityReader,
} from "./vault-activity.js";

import {
  CommitmentVerificationWorker,
  CommitmentVerifier,
  FixedRewardPolicy,
  PersistenceVerificationStore,
  PersistenceWeeklySavingsEvidenceSource,
  ViemCommitmentSettlementGateway,
} from "./verifier/index.js";

const VERIFICATION_INTERVAL_MS =
  60_000;

const VERIFICATION_BATCH_SIZE =
  50;

// Temporary hackathon reward.
//
// USDC uses 6 decimals, so this is 5 USDC.
// Keep this simple until the final commitment
// reward economics are decided.
const WEEKLY_SAVINGS_REWARD_ASSETS =
  5_000_000n;

const config =
  loadApiConfig();

const commitmentWindowOverrideSeconds =
  config.monadChainId === 31_337
    && process.env.ENABLE_LOCAL_ANVIL === "true"
    && process.env.DEV_COMMITMENT_WINDOW_SECONDS
    ? Number(
      process.env.DEV_COMMITMENT_WINDOW_SECONDS,
    )
    : undefined;

if (
  commitmentWindowOverrideSeconds !== undefined
  && (
    !Number.isSafeInteger(
      commitmentWindowOverrideSeconds,
    )
    || commitmentWindowOverrideSeconds < 10
  )
) {
  throw new Error(
    "DEV_COMMITMENT_WINDOW_SECONDS must be an integer >= 10",
  );
}

const database =
  connectDatabase(
    config.databaseUrl,
  );

const repository =
  new KeptRepository(
    database.db,
  );

const publicClient =
  createPublicClient({
    transport:
      http(
        config.monadRpcUrl,
      ),
  });

const verifierAccount =
  privateKeyToAccount(
    config.commitmentVerifierPrivateKey,
  );

const verifierWalletClient =
  createWalletClient({
    account:
      verifierAccount,

    transport:
      http(
        config.monadRpcUrl,
      ),
  });

const commitmentSettlementGateway =
  new ViemCommitmentSettlementGateway({
    publicClient,

    walletClient:
      verifierWalletClient,

    manager:
      config.commitmentManagerAddress,
  });

const vaultShares =
  createVaultShareBalanceReader({
    publicClient: {
      getChainId:
        () =>
          publicClient
            .getChainId(),

      readContract:
        async (request) =>
          publicClient
            .readContract(
              request as never,
            ) as Promise<bigint>,
    },

    vault:
      config.keptSavingsVaultAddress,

    chainId:
      config.monadChainId,
  });

const vaultActivity =
  createVaultSavingsActivityReader({
    publicClient: {
      getChainId:
        () =>
          publicClient
            .getChainId(),

      getBlockNumber:
        () =>
          publicClient
            .getBlockNumber(),

      getBlock:
        async (request) => {
          const block =
            await publicClient
              .getBlock(
                request,
              );

          return {
            number:
              block.number,

            timestamp:
              block.timestamp,
          };
        },

      getLogs:
        async (request) =>
          publicClient
            .getLogs(
              request as never,
            ) as never,
    },

    vault:
      config.keptSavingsVaultAddress,

    chainId:
      config.monadChainId,
  });

const weeklySavingsEvidence =
  new PersistenceWeeklySavingsEvidenceSource({
    repository,

    vaultShares,

    vaultActivity,

    chainId:
      BigInt(
        config.monadChainId,
      ),
  });

const verificationStore =
  new PersistenceVerificationStore(
    database.db,
  );

const rewards =
  new FixedRewardPolicy(
    WEEKLY_SAVINGS_REWARD_ASSETS,
  );

const commitmentVerifier =
  new CommitmentVerifier({
    store:
      verificationStore,

    weeklySavings:
      weeklySavingsEvidence,

    // ACTIVITY_COUNT_V1 is deliberately not
    // enabled in the automatic worker yet.
    //
    // The due-commitment repository query
    // should currently select only
    // WEEKLY_SAVINGS_V1 commitments.
    activity: {
      async countActivities() {
        throw new Error(
          "Activity verification is not enabled",
        );
      },
    },

    settlement:
      commitmentSettlementGateway,

    rewards,
  });

const verificationWorker =
  new CommitmentVerificationWorker({
    repository,

    verifier:
      commitmentVerifier,

    batchSize:
      VERIFICATION_BATCH_SIZE,
  });

const persistence =
  new KeptPersistenceService(
    database.db,
    {
      chainId:
        BigInt(
          config.monadChainId,
        ),

      reader:
        vaultShares,
    },
    config.commitmentWindowOverrideSeconds,
  );

const settlementVerifier =
  createCommitmentSettlementVerifier({
    publicClient: {
      getChainId:
        () =>
          publicClient
            .getChainId(),

      getTransaction:
        async (request) => {
          const transaction =
            await publicClient
              .getTransaction(
                request,
              );

          return {
            from:
              transaction.from,

            to:
              transaction.to,

            input:
              transaction.input,
          };
        },

      getTransactionReceipt:
        async (request) => {
          const receipt =
            await publicClient
              .getTransactionReceipt(
                request,
              );

          return {
            status:
              receipt.status,

            blockNumber:
              receipt.blockNumber,

            logs:
              receipt.logs.map(
                (log) => ({
                  address:
                    log.address,

                  data:
                    log.data,

                  topics:
                    log.topics,
                }),
              ),
          };
        },

      getBlockNumber:
        () =>
          publicClient
            .getBlockNumber(),

      readContract:
        (request) =>
          publicClient
            .readContract(
              request,
            ),
    },

    chainId:
      config.monadChainId,

    manager:
      config.commitmentManagerAddress,
  });

const app =
  buildApp(
    {
      authenticate:
        createPrivyAuthenticator({
          appId:
            config.privyAppId,

          verificationKey:
            config.privyJwtVerificationKey,

          appSecret:
            config.privyAppSecret,
        }),

      persistence,

      commitmentSettlementVerifier:
        settlementVerifier,
    },
    {
      enableLogging:
        true,

      webOrigin:
        config.webOrigin,
    },
  );

let verificationInterval:
  ReturnType<typeof setInterval>
  | null = null;

let verificationRunning =
  false;

let closing =
  false;

async function runVerification(): Promise<void> {
  if (
    verificationRunning
    || closing
  ) {
    return;
  }

  verificationRunning =
    true;

  try {
    const result =
      await verificationWorker
        .runOnce();

    if (
      result.checked > 0
      || result.failed > 0
    ) {
      app.log.info(
        result,
        "Commitment verification pass completed",
      );
    }
  } catch (error) {
    app.log.error(
      error,
      "Commitment verification worker failed",
    );
  } finally {
    verificationRunning =
      false;
  }
}

const close =
  async (): Promise<void> => {
    if (closing) {
      return;
    }

    closing =
      true;

    if (
      verificationInterval
      !== null
    ) {
      clearInterval(
        verificationInterval,
      );

      verificationInterval =
        null;
    }

    try {
      await app.close();
    } finally {
      await database.close();
    }
  };

process.once(
  "SIGINT",
  () => {
    void close();
  },
);

process.once(
  "SIGTERM",
  () => {
    void close();
  },
);

try {
  await app.listen({
    host:
      "0.0.0.0",

    port:
      config.port,
  });

  app.log.info(
    {
      verifier:
        verifierAccount.address,

      intervalMs:
        VERIFICATION_INTERVAL_MS,

      batchSize:
        VERIFICATION_BATCH_SIZE,
    },
    "Commitment verification worker enabled",
  );

  // Run once immediately after the API
  // has successfully started.
  await runVerification();

  verificationInterval =
    setInterval(
      () => {
        void runVerification();
      },
      VERIFICATION_INTERVAL_MS,
    );
} catch (error) {
  app.log.error(
    error,
    "API startup failed",
  );

  await close();

  process.exitCode =
    1;
}