import {
    encodeFunctionData,
    erc20Abi,
    getAddress,
    type Address,
} from "viem";

import type { KeptTransactionSender } from "@/chain/transaction-sender";

export async function executeDirectUsdcWithdrawal({
    usdc,
    recipient,
    amount,
    chainId,
    sender,
}: {
    readonly usdc: Address;
    readonly recipient: string;
    readonly amount: bigint;
    readonly chainId: number;
    readonly sender: KeptTransactionSender;
}) {
    return sender.sendTransaction({
        to: usdc,
        chainId,
        data:
            encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [
                    getAddress(recipient),
                    amount,
                ],
            }),
    });
}