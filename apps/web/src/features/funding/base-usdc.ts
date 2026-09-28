import {
    createPublicClient,
    erc20Abi,
    http,
} from "viem";
import {
    base,
} from "viem/chains";

import {
    BASE_USDC,
} from "./intents/kept-funding-recipe";

const baseClient =
    createPublicClient({
        chain: base,
        transport:
            http(),
    });

export async function readBaseUsdcBalance(
    address: `0x${string}`,
): Promise<bigint> {
    return baseClient.readContract({
        address:
            BASE_USDC as `0x${string}`,
        abi:
            erc20Abi,
        functionName:
            "balanceOf",
        args: [
            address,
        ],
    });
}