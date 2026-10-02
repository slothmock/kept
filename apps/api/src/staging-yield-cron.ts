import { createPublicClient, createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MONAD_TESTNET_CHAIN_ID = 10_143;

const strategyAbi = [
  {
    type: "function",
    name: "previewAccruedYield",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "accrueYield",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "accruedAssets", type: "uint256" }],
  },
] as const;

function requireValue(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

const rpcUrl = requireValue("MONAD_RPC_URL");
const strategy = getAddress(requireValue("STAGING_YIELD_STRATEGY_ADDRESS"));
const account = privateKeyToAccount(
  requireValue("COMMITMENT_VERIFIER_PRIVATE_KEY") as `0x${string}`,
);

const publicClient = createPublicClient({
  transport: http(rpcUrl),
});

const walletClient = createWalletClient({
  account,
  transport: http(rpcUrl),
});

const chainId = await publicClient.getChainId();

if (chainId !== MONAD_TESTNET_CHAIN_ID) {
  throw new Error(
    `Staging yield cron requires Monad testnet ${MONAD_TESTNET_CHAIN_ID}; received ${chainId}`,
  );
}

const pending = await publicClient.readContract({
  address: strategy,
  abi: strategyAbi,
  functionName: "previewAccruedYield",
});

if (pending === 0n) {
  console.log("No staging yield is ready to accrue.");
  process.exit(0);
}

const hash = await walletClient.writeContract({
  address: strategy,
  abi: strategyAbi,
  functionName: "accrueYield",
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== "success") {
  throw new Error(`Staging yield accrual failed: ${hash}`);
}

console.log(
  JSON.stringify({
    event: "staging_yield_accrued",
    pendingAssetsAtomic: pending.toString(),
    transactionHash: hash,
  }),
);
