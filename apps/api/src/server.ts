import { createPublicClient, http } from "viem";

import { createPrivyAuthenticator } from "./auth.js";
import { buildApp } from "./app.js";
import { loadApiConfig } from "./config.js";
import { connectDatabase } from "./db/client.js";
import { KeptPersistenceService } from "./persistence/index.js";
import { createCommitmentSettlementVerifier } from "./commitment-settlement.js";
import { createVaultShareBalanceReader } from "./vault-shares.js";

const config = loadApiConfig();
const database = connectDatabase(config.databaseUrl);
const publicClient = createPublicClient({ transport: http(config.monadRpcUrl) });
const app = buildApp({
  authenticate: createPrivyAuthenticator({
    appId: config.privyAppId,
    verificationKey: config.privyJwtVerificationKey,
    appSecret: config.privyAppSecret
  }),
  persistence: new KeptPersistenceService(database.db, {
    chainId: BigInt(config.monadChainId),
    reader: createVaultShareBalanceReader({
      publicClient: {
        getChainId: () => publicClient.getChainId(),
        readContract: async (request) => publicClient.readContract(request as never) as Promise<bigint>,
      },
      vault: config.keptSavingsVaultAddress,
      chainId: config.monadChainId,
    }),
  }),
  commitmentSettlementVerifier: createCommitmentSettlementVerifier({
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
  }),
}, { enableLogging: true, webOrigin: config.webOrigin });

const close = async () => {
  await app.close();
  await database.close();
};

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
} catch (error) {
  app.log.error(error, "API startup failed");
  await close();
  process.exitCode = 1;
}
