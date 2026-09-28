import {
    createPublicClient,
    http,
} from "viem";

import {
    readVaultConfig,
} from "@/vault/config";

const vaultTransparencyAbi = [
    {
        type: "function",
        name: "DEPOSIT_FEE_BPS",
        stateMutability: "view",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "uint16",
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
                type: "uint16",
            },
        ],
    },
] as const;

export interface SavingsTransparency {
    readonly chainId: number;
    readonly networkName: string;
    readonly savingsAsset: "USDC";
    readonly depositFeeBps: number | null;
    readonly performanceFeeBps: number | null;
}

function networkName(
    chainId: number,
): string {
    switch (chainId) {
        case 143:
            return "Monad";

        case 31337:
            return "Local development network";

        default:
            return `Chain ${chainId}`;
    }
}

export async function readSavingsTransparency():
    Promise<SavingsTransparency | null> {
    const config =
        readVaultConfig(import.meta.env);

    if (!config) {
        return null;
    }

    const client =
        createPublicClient({
            transport: http(
                config.rpcUrl,
            ),
        });

    let depositFeeBps:
        number | null = null;

    let performanceFeeBps:
        number | null = null;

    try {
        const value =
            await client.readContract({
                address: config.vault,
                abi: vaultTransparencyAbi,
                functionName:
                    "DEPOSIT_FEE_BPS",
            });

        depositFeeBps =
            Number(value);
    } catch {
        // Configuration details should still
        // be available if a fee read fails.
    }

    try {
        const value =
            await client.readContract({
                address: config.vault,
                abi: vaultTransparencyAbi,
                functionName: "PROFIT_FEE_BPS",
            });

        performanceFeeBps =
            Number(value);
    } catch {
        // Same reasoning here.
    }

    return {
        chainId:
            config.chainId,

        networkName:
            networkName(
                config.chainId,
            ),

        savingsAsset:
            "USDC",

        depositFeeBps,

        performanceFeeBps,
    };
}